"""Real HTTP acceptance; refuses every origin except the isolated patient-access test stack.

No fixture or credential from this suite is written to the user's local clinic database.
"""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from api_client import Client

REST = '/openmrs/ws/rest/v1'
API = REST + '/vinshc'
REQUESTS = API + '/patient-access/requests'
NOTICES = API + '/notifications'


@unittest.skipUnless(os.environ.get('VINSHC_PATIENT_ACCESS_TEST_BASE') == 'http://127.0.0.1:17888',
                     'Requires the dedicated vinshc-patient-access-test Docker project on port 17888')
class PatientAccessAcceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = os.environ['VINSHC_PATIENT_ACCESS_TEST_BASE']
        source = Path(os.environ.get('VINSHC_PATIENT_ACCESS_ENV_FILE', ROOT / 'infra/frontend/.runtime/backend/.env'))
        env = dict(line.split('=', 1) for line in source.read_text().splitlines()
                   if line and not line.startswith('#') and '=' in line)
        cls.settings = env
        cls.admin = Client(cls.base, env['EHR_ADMIN_USERNAME'], env['EHR_ADMIN_PASSWORD'])
        cls.location = json.loads((ROOT / 'config/baseline.json').read_text())['developmentLocation']['uuid']
        cls.inbox_admin = Client(cls.base, cls.admin.username, cls.admin.password, default_headers=cls.headers('admin'))
        cls.users, cls.clients = {}, {}
        for key, role in [('reception', 'reception'), ('doctor', 'doctor'), ('other', 'doctor'), ('appadmin', 'admin')]:
            password = 'Qa-only-' + secrets.token_hex(16)
            body = {'username': 'pa-' + key + '-' + uuid.uuid4().hex[:10], 'password': password, 'role': role,
                    'givenName': 'Synthetic', 'familyName': role, 'gender': 'U'}
            user = cls.admin.json(API + '/staff/users', method='POST', payload=body, statuses=(201,))
            cls.admin.json(API + '/authorization/assignment', method='POST', statuses=(201,),
                           payload={'user': user['uuid'], 'role': role, 'facility': cls.location})
            cls.users[key] = user
            cls.clients[key] = Client(cls.base, body['username'], password, default_headers=cls.headers(role))
            if role == 'doctor':
                provider = cls.admin.json(API + '/directory/providers', method='POST', statuses=(200, 201), payload={
                    'userUuid': user['uuid'], 'facilityLocationUuid': cls.location, 'identifier': 'PA-' + uuid.uuid4().hex[:16]})
                cls.users[key]['provider'] = provider['uuid']
        cls.away = cls.admin.json(REST + '/location', method='POST', statuses=(200, 201),
                                 payload={'name': 'Synthetic Access Other ' + uuid.uuid4().hex[:8]})['uuid']
        cls.away_admin = Client(cls.base, cls.admin.username, cls.admin.password, default_headers=cls.headers('admin', cls.away))

    @classmethod
    def headers(cls, role, location=None):
        return {'X-VinSHC-Workspace-Role': role, 'X-VinSHC-Workspace-Facility': location or cls.location}

    @classmethod
    def intake(cls, queue=True):
        # Reception first registers the patient, opens a visit and hands it to the selected doctor.
        name = 'Synthetic' + ''.join(chr(97 + int(c, 16)) for c in uuid.uuid4().hex[:10])
        patient = cls.clients['reception'].json(API + '/patients', method='POST', statuses=(201,), payload={
            'familyName': 'Acceptance', 'givenName': name, 'gender': 'U', 'birthPrecision': 'year', 'birthYear': 1990,
            'identifiers': [{'type': 'cccd', 'identifier': str(secrets.randbelow(9 * 10**11) + 10**11)}],
            'idempotencyKey': str(uuid.uuid4())})
        visit = cls.clients['reception'].json(API + '/visits', method='POST', statuses=(201,),
                                            payload={'patient': patient['uuid'], 'visitType': 'outpatient'})
        if queue:
            cls.clients['reception'].json(API + '/operations/queue', method='POST', statuses=(200, 201), payload={
                'patient': patient['uuid'], 'visit': visit['uuid'], 'provider': cls.users['doctor']['provider'],
                'config': 'STANDARD_POSTPAY', 'point': 'DOCTOR', 'idempotencyKey': str(uuid.uuid4())})
        return patient, visit

    @classmethod
    def payload(cls, patient, visit, kind='patient_account_create'):
        return {'type': kind, 'patientUuid': patient['uuid'], 'visitUuid': visit['uuid'],
                'note': 'Synthetic handoff', 'idempotencyKey': str(uuid.uuid4())}

    def request(self, client, method, path, payload=None, expected=(200,)):
        status, headers, content = client.request(path, method=method, payload=payload, timeout=90)
        self.assertIn(status, expected, f'{method} {path}: HTTP {status}')
        self.assertIn('json', headers.get('Content-Type', '').lower())
        return json.loads(content)

    def no_secrets(self, result, password):
        text = json.dumps(result)
        self.assertNotIn(password, text)
        for key in ('"password"', '"salt"', '"hashedPassword"', '"secret"'):
            self.assertNotIn(key, text)

    def test_01_reception_doctor_request_admin_create_patient_login(self):
        patient, visit = self.intake()
        cls = type(self); cls.patient, cls.visit = patient, visit
        before = self.clients['doctor'].json(NOTICES)
        self.assertTrue(any(n['type'] == 'visit_assigned' and n['target']['visitUuid'] == visit['uuid'] for n in before['results']))
        payload = self.payload(patient, visit)
        request = self.request(self.clients['doctor'], 'POST', REQUESTS, payload, (201,))
        cls.account_request, cls.request_body = request, payload
        self.assertEqual(request['status'], 'pending')
        self.assertEqual(request['patientName'], patient['fullName'], 'The request must keep the clinic family-middle-given name order')
        self.assertEqual(self.request(self.clients['doctor'], 'POST', REQUESTS, payload, (201,))['uuid'], request['uuid'])
        self.request(self.clients['doctor'], 'POST', REQUESTS, {**payload, 'idempotencyKey': str(uuid.uuid4())}, (409,))
        admin_notices = self.inbox_admin.json(NOTICES)
        self.assertEqual(sum(n['target'] and n['target'].get('requestUuid') == request['uuid'] for n in admin_notices['results']), 1)
        password = 'Patient-only-' + secrets.token_hex(16); username = 'patient-' + uuid.uuid4().hex[:12]
        fulfillment = {'username': username, 'password': password, 'verificationMethod': 'verified_clinic_record', 'idempotencyKey': str(uuid.uuid4())}
        created = self.request(self.inbox_admin, 'POST', REQUESTS + '/' + request['uuid'] + '/fulfill', fulfillment)
        self.assertEqual((created['status'], created['username']), ('fulfilled', username)); self.no_secrets(created, password)
        self.assertEqual(self.request(self.inbox_admin, 'POST', REQUESTS + '/' + request['uuid'] + '/fulfill', fulfillment)['uuid'], request['uuid'])
        cls.portal_user, cls.portal_password = username, password
        cls.portal = Client(self.base, username, password)
        self.assertEqual(cls.portal.json(API + '/portal/me')['patientUuid'], patient['uuid'])
        self.assertEqual(cls.portal.json(API + '/portal/visits')['results'], [], 'Account creation never publishes clinical data')
        self.assertEqual(cls.portal.json(NOTICES)['results'][0]['type'], 'portal_account_created')
        request_list = self.clients['doctor'].json(REQUESTS + '?patientUuid=' + patient['uuid'])
        self.assertEqual(request_list['results'][0]['status'], 'fulfilled')
        self.no_secrets(self.inbox_admin.json(API + '/staff/audit'), password)

    def test_02_role_facility_and_doctor_relationship_guards(self):
        patient, visit = self.patient, self.visit; payload = self.payload(patient, visit)
        for key in ['reception', 'appadmin', 'other']:
            self.request(self.clients[key], 'POST', REQUESTS, payload, (403,))
        self.request(self.clients['other'], 'GET', REQUESTS + '/' + self.account_request['uuid'], expected=(403,))
        self.request(self.away_admin, 'GET', REQUESTS + '/' + self.account_request['uuid'], expected=(403,))
        self.request(self.clients['appadmin'], 'POST', REQUESTS + '/' + self.account_request['uuid'] + '/fulfill', {}, (403,))
        self.assertFalse(self.clients['appadmin'].json(REQUESTS)['capabilities']['fulfill'])
        for route in [REQUESTS, REST + '/user', API + '/patients', API + '/staff/users']:
            self.request(self.portal, 'GET', route, expected=(403,))
        anonymous = Client(self.base, '', '')
        self.assertEqual(anonymous.request(NOTICES, auth=False)[0], 401)
        self.assertEqual(anonymous.request(REQUESTS, auth=False)[0], 401)
        unassigned, other_visit = self.intake(queue=False)
        self.request(self.clients['doctor'], 'POST', REQUESTS, self.payload(unassigned, other_visit), (403,))
        self.request(self.clients['doctor'], 'POST', REQUESTS, {**payload, 'patientUuid': unassigned['uuid']}, (400,))

    def test_03_notifications_are_recipient_scoped_and_persistent(self):
        notices = self.inbox_admin.json(NOTICES); item = next(n for n in notices['results'] if n['target'] and n['target'].get('requestUuid') == self.account_request['uuid'])
        self.request(self.clients['doctor'], 'POST', NOTICES + '/' + item['uuid'] + '/read', {}, (403,))
        self.request(self.away_admin, 'POST', NOTICES + '/' + item['uuid'] + '/read', {}, (403,))
        self.request(self.inbox_admin, 'POST', NOTICES + '/' + item['uuid'] + '/read')
        self.request(self.inbox_admin, 'POST', NOTICES + '/' + item['uuid'] + '/read')
        self.assertTrue(next(n for n in self.inbox_admin.json(NOTICES)['results'] if n['uuid'] == item['uuid'])['readAt'])
        self.request(self.inbox_admin, 'POST', NOTICES + '/read-all')
        self.assertEqual(self.inbox_admin.json(NOTICES)['unreadCount'], 0)
        # New event after read-all remains unread. Never use a client unread count as authority.
        p, v = self.intake(); self.request(self.clients['doctor'], 'POST', REQUESTS, self.payload(p, v), (201,))
        self.assertEqual(self.inbox_admin.json(NOTICES)['unreadCount'], 1)
        self.assertFalse(self.away_admin.json(NOTICES)['results'])
        self.assertEqual(self.clients['other'].json(NOTICES)['results'], [])

    def test_04_reset_and_reject_never_create_duplicate_accounts(self):
        self.request(self.clients['doctor'], 'POST', REQUESTS, self.payload(self.patient, self.visit), (409,))
        body = self.payload(self.patient, self.visit, 'patient_password_reset')
        request = self.request(self.clients['doctor'], 'POST', REQUESTS, body, (201,))
        password = 'Reset-only-' + secrets.token_hex(16)
        reset = {'password': password, 'verificationMethod': 'verified_clinic_record', 'idempotencyKey': str(uuid.uuid4())}
        result = self.request(self.inbox_admin, 'POST', REQUESTS + '/' + request['uuid'] + '/fulfill', reset)
        self.no_secrets(result, password); self.assertEqual(result['username'], self.portal_user)
        old_status, _, old_body = Client(self.base, self.portal_user, self.portal_password).request(REST + '/session')
        self.assertIn(old_status, (200, 401))
        if old_status == 200: self.assertFalse(json.loads(old_body)['authenticated'])
        self.assertEqual(Client(self.base, self.portal_user, password).json(API + '/portal/me')['patientUuid'], self.patient['uuid'])
        second = self.request(self.clients['doctor'], 'POST', REQUESTS, self.payload(self.patient, self.visit, 'patient_password_reset'), (201,))
        rejected = self.request(self.inbox_admin, 'POST', REQUESTS + '/' + second['uuid'] + '/reject', {'reason': 'Synthetic refusal'})
        self.assertEqual(rejected['status'], 'rejected')
        self.request(self.inbox_admin, 'POST', REQUESTS + '/' + second['uuid'] + '/fulfill', reset, (409,))

    def test_05_concurrent_create_and_fulfill_are_idempotent(self):
        patient, visit = self.intake(); payload = self.payload(patient, visit)
        def create(_):
            client = Client(self.base, self.clients['doctor'].username, self.clients['doctor'].password, default_headers=self.headers('doctor'))
            return client.json(REQUESTS, method='POST', statuses=(201,), payload=payload)
        with ThreadPoolExecutor(2) as pool: rows = list(pool.map(create, range(2)))
        self.assertEqual(rows[0]['uuid'], rows[1]['uuid'])
        fulfillment = {'username': 'race-' + uuid.uuid4().hex[:12], 'password': 'Concurrent-' + secrets.token_hex(16),
                       'verificationMethod': 'verified_clinic_record', 'idempotencyKey': str(uuid.uuid4())}
        def fulfill(_):
            client = Client(self.base, self.admin.username, self.admin.password, default_headers=self.headers('admin'))
            return client.json(REQUESTS + '/' + rows[0]['uuid'].upper() + '/fulfill', method='POST', payload=fulfillment)
        with ThreadPoolExecutor(2) as pool: completed = list(pool.map(fulfill, range(2)))
        self.assertEqual(completed[0], completed[1]); self.no_secrets(completed, fulfillment['password'])
        listing = self.admin.json(REST + '/user?q=' + fulfillment['username'] + '&v=full')
        self.assertEqual(len([u for u in listing['results'] if u['username'] == fulfillment['username']]), 1)

    def test_06_validation_and_failed_fulfillment_preserve_pending_request(self):
        p, v = self.intake(); body = self.payload(p, v)
        request = self.request(self.clients['doctor'], 'POST', REQUESTS, body, (201,))
        endpoint = REQUESTS + '/' + request['uuid'] + '/fulfill'
        valid = {'username': 'validate-' + uuid.uuid4().hex[:10], 'password': 'Validation-' + secrets.token_hex(16),
                 'verificationMethod': 'verified_clinic_record', 'idempotencyKey': str(uuid.uuid4())}
        for bad in [{**valid, 'password': 'short'}, {**valid, 'roles': ['System Developer']},
                    {**valid, 'verificationMethod': ''}, {**valid, 'username': 'bad username'}]:
            result = self.request(self.inbox_admin, 'POST', endpoint, bad, (400,))
            self.no_secrets(result, valid['password'])
            self.assertEqual(self.inbox_admin.json(REQUESTS + '/' + request['uuid'])['status'], 'pending')
        self.assertEqual(self.admin.json(REST + '/user?q=' + valid['username'])['results'], [])
        for route in [REQUESTS + '?limit=0', REQUESTS + '?offset=-1', REQUESTS + '?status=wrong', NOTICES + '?limit=101']:
            self.request(self.inbox_admin, 'GET', route, expected=(400,))
        self.request(self.clients['doctor'], 'POST', REQUESTS, {**body, 'note': 'Changed payload'}, (409,))
        first = self.inbox_admin.json(REQUESTS + '?limit=1&offset=0'); second = self.inbox_admin.json(REQUESTS + '?limit=1&offset=1')
        self.assertTrue(first['hasMore']); self.assertNotEqual(first['results'][0]['uuid'], second['results'][0]['uuid'])

    def test_07_real_browser_doctor_admin_patient(self):
        fixtures = []
        for width in [1440, 390]:
            p, v = self.intake()
            fixtures.append({'width': width, 'patient': p, 'visit': v, 'username': 'browser-' + uuid.uuid4().hex[:12],
                             'password': 'Browser-only-' + secrets.token_hex(16)})
        env = {**os.environ, 'PA_TEST_FIXTURES': json.dumps(fixtures),
               'PA_TEST_DOCTOR_USER': self.clients['doctor'].username, 'PA_TEST_DOCTOR_PASSWORD': self.clients['doctor'].password,
               'PA_TEST_ADMIN_USER': self.admin.username, 'PA_TEST_ADMIN_PASSWORD': self.admin.password}
        script = ROOT / 'infra/frontend/tests/browser/live-patient-access-check.cjs'
        result = subprocess.run(['node', str(script)], cwd=ROOT / 'infra/frontend', env=env, capture_output=True, text=True, timeout=180)
        # Do not expose subprocess messages that might contain an entered credential.
        detail = (result.stdout + '\n' + result.stderr)[-4500:]
        for value in [self.admin.password, self.clients['doctor'].password, *[f['password'] for f in fixtures]]:
            detail = detail.replace(value, '[redacted]')
        self.assertEqual(result.returncode, 0, detail)
        print(result.stdout.strip())

    def test_06b_database_failure_rolls_back_user_link_and_notifications(self):
        container = 'vinshc-patient-access-test-db-1'
        project = subprocess.check_output(['docker', 'inspect', '-f', '{{ index .Config.Labels "com.docker.compose.project" }}', container], text=True).strip()
        self.assertEqual(project, 'vinshc-patient-access-test', 'Refuse rollback injection in any other database')
        def sql(statement):
            result = subprocess.run(['docker', 'exec', '-i', container, 'sh', '-c',
                'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At'],
                input=statement, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, 'Isolated SQL fixture failed')
        p, v = self.intake(); request = self.request(self.clients['doctor'], 'POST', REQUESTS, self.payload(p, v), (201,))
        body = {'username': 'rollback-' + uuid.uuid4().hex[:10], 'password': 'Rollback-only-' + secrets.token_hex(16),
                'verificationMethod': 'verified_clinic_record', 'idempotencyKey': str(uuid.uuid4())}
        sql("CREATE OR REPLACE FUNCTION vinshc_test_fail_access() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
            "IF NEW.request_uuid='" + request['uuid'] + "' THEN RAISE EXCEPTION 'synthetic rollback'; END IF; RETURN NEW; END; $$; "
            "CREATE TRIGGER vinshc_test_access_failure BEFORE UPDATE ON vinshc_patient_access_request FOR EACH ROW EXECUTE FUNCTION vinshc_test_fail_access();")
        try:
            result = self.request(self.inbox_admin, 'POST', REQUESTS + '/' + request['uuid'] + '/fulfill', body, (500,))
            self.no_secrets(result, body['password'])
            self.assertEqual(self.inbox_admin.json(REQUESTS + '/' + request['uuid'])['status'], 'pending')
            self.assertEqual(self.admin.json(REST + '/user?q=' + body['username'])['results'], [])
        finally:
            sql('DROP TRIGGER IF EXISTS vinshc_test_access_failure ON vinshc_patient_access_request; DROP FUNCTION IF EXISTS vinshc_test_fail_access();')
        # Same request/key can now complete; the failed transaction did not leave a duplicate user/link.
        completed = self.request(self.inbox_admin, 'POST', REQUESTS + '/' + request['uuid'] + '/fulfill', body)
        self.assertEqual(completed['status'], 'fulfilled')
