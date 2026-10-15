"""MVP integration against a fresh synthetic clinic and the same-origin web/agent proxy.

These are API/authorization regressions, not a clinical quality benchmark or real-model evaluation.
"""
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sys
import unittest
import uuid
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts'))
sys.path.insert(0,str(Path(__file__).resolve().parent))
from api_client import Client
import test_b11_care_workflow as care
REST=care.REST
API=care.VINSHC
PORTAL=API+'/portal'

class AgentPortalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixtures=type('PortalFixture',(care.CareWorkflowTests,),{})
        fixtures.setUpClass()
        cls.flow=fixtures('runTest')
        cls.fixtures=fixtures
        cls.checks=[]
        cls.accounts=[]
        cls.flow.test_01_reception_registers_with_idgen_number_duplicates_and_idempotency()
        cls.flow.test_03_visit_opens_once_and_other_facility_is_out_of_scope()
        cls.flow.test_04_nurse_encounter_vitals_list_correct_and_void()
        cls.patient=cls.flow.state['patient'];cls.visit=cls.flow.state['visit']
        cls.encounter=cls.flow.ok('doctor',f'{API}/visits/{cls.visit}/encounters',{'encounterType':'consultation'},statuses=(201,))['uuid']
        cls.flow.ok('doctor',API+'/consultation',{'patient':cls.patient,'encounter':cls.encounter,'values':{
            'visit.ly_do_kham':'Kiểm thử hồ sơ mẫu','allergy.trang_thai':'no_known_allergy',
            'exam.loi_dan':'Lời dặn synthetic đã được bác sĩ công bố.',
            'history.benh_su':'Thông tin mẫu, liên hệ 0912345678.',
            'followup.ngay_tai_kham':(datetime.now(timezone.utc)+timedelta(days=7)).date().isoformat()}},statuses=(201,))
        cls.flow.ok('doctor',API+'/diagnosis',{'patient':cls.patient,'encounter':cls.encounter,'concept':cls.flow.catalogue['diagnoses']['a'],'rank':'primary','certainty':'confirmed'},statuses=(201,))
        c=cls.flow.catalogue
        cls.order=cls.flow.ok('doctor',API+'/drug-order',{'patient':cls.patient,'encounter':cls.encounter,'orderer':cls.flow.providers['doctor'],
            'drug':c['drugs']['a'],'dose':1,'doseUnits':c['doseUnit'],'route':c['route'],'frequency':c['frequency'],
            'duration':5,'durationUnits':c['days'],'quantity':10,'quantityUnits':c['quantityUnit'],'numRefills':0},statuses=(201,))['uuid']
        cls.lab_order=cls.flow.ok('doctor',care.OPS+'/service-orders',{
            'patient':cls.patient,'encounter':cls.encounter,
            'orderer':cls.flow.providers['doctor'],'facility':cls.flow.facility['uuid'],
            'service':cls.flow.services['LAB-GLU']['uuid'],'config':'STANDARD_POSTPAY',
            'idempotencyKey':'p3-'+uuid.uuid4().hex},statuses=(201,))['uuid']
        cls.patient_client,cls.patient_user=cls.portal_account(cls.patient)
        other=cls.flow.ok('reception',API+'/patients',cls.flow.registration(familyName='Synthetic',middleName='Portal'+care.letters(8),givenName='Khác',
            identifiers=[{'type':'cccd','identifier':str(100000000000+int(uuid.uuid4().hex[:10],16)%899999999999)}]),statuses=(201,))['uuid']
        cls.other_client,cls.other_user=cls.portal_account(other)
        doctor=cls.flow.staff['doctor']
        app_base='http://127.0.0.1:'+os.environ.get('VINSHC_APP_PORT','5184')
        cls.doctor_agent=Client(app_base,doctor.username,doctor.password,default_headers=doctor.default_headers)
        cls.patient_agent=Client(app_base,cls.patient_client.username,cls.patient_client.password)
    @classmethod
    def portal_account(cls,patient):
        username='portal-'+uuid.uuid4().hex[:10];password='Test!'+uuid.uuid4().hex
        user=cls.flow.admin.json(REST+'/user',method='POST',statuses=(200,201),payload={'username':username,'password':password,'person':patient})
        cls.accounts.append(user['uuid'])
        linked=cls.flow.admin.json(PORTAL+'/accounts',method='POST',payload={'userUuid':user['uuid'],'patientUuid':patient})
        assert linked['status']=='pending' and not linked['active']
        portal=Client(cls.flow.base,username,password)
        assert portal.request(PORTAL+'/session')[0]==403
        assert portal.request(PORTAL+'/visits')[0]==403
        activated=cls.flow.admin.json(PORTAL+'/accounts/'+user['uuid']+'/verify',method='POST',
                            payload={'verificationMethod':'in_person_document'})
        assert activated['active']
        events=cls.flow.admin.json(PORTAL+'/accounts/'+user['uuid']+'/history')['results']
        assert [e['status'] for e in events]==['pending','active']
        assert events[1]['verification_method']=='in_person_document'
        assert all(e['actor_uuid'] and e['date_created'] for e in events)
        return portal,user['uuid']
    @classmethod
    def tearDownClass(cls):
        expected=11 if os.environ.get('VINSHC_TEST_AGENT_ADVANCED')=='true' else 10
        report={'passed':len(cls.checks)==expected,'checks':cls.checks,'model':'fake','clinicalEvaluationDeferred':True}
        path=ROOT/'.runtime/reports/b12-agent-portal.json';path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        for user in cls.accounts:cls.flow.admin.request(REST+'/user/'+user+'?reason=synthetic-test-complete',method='DELETE')
        for provider in cls.fixtures.created_providers:cls.flow.admin.request(REST+'/provider/'+provider+'?reason=synthetic-test-complete',method='DELETE')
        for user,person in cls.fixtures.created_users:cls.flow.admin.request(REST+'/user/'+user+'?reason=synthetic-test-complete',method='DELETE')
        for location in cls.fixtures.created_locations:cls.flow.admin.request(REST+'/location/'+location+'?reason=synthetic-test-complete',method='DELETE')
    def done(self,name):self.checks.append({'name':name,'passed':True})
    def test_01_publication_is_explicit_and_finalization_required(self):
        self.assertEqual(self.patient_client.json(PORTAL+'/session')['patientUuid'],self.patient)
        self.assertEqual(self.patient_client.json(PORTAL+'/visits')['results'],[])
        self.assertEqual(self.flow.call('doctor',PORTAL+f'/visits/{self.visit}/publication',method='POST',payload={'encounterUuid':self.encounter,'sections':['instructions','prescriptions']})[0],400)
        self.flow.ok('doctor',API+f'/encounter/{self.encounter}/finalize',{})
        self.assertEqual(self.patient_client.json(PORTAL+'/visits')['results'],[])
        self.assertEqual(self.flow.call('doctor',PORTAL+f'/visits/{self.visit}/publication',
            method='POST',payload={'encounterUuid':self.encounter})[0],400)
        publication=self.flow.ok('doctor',PORTAL+f'/visits/{self.visit}/publication',{'encounterUuid':self.encounter,'sections':['instructions','prescriptions']})
        self.assertEqual(publication['version'],1)
        type(self).publication_uuid=publication['uuid']
        me=self.patient_client.json(PORTAL+'/me')
        self.assertEqual(me['patientUuid'],self.patient)
        self.assertEqual(me['linkStatus'],'active')
        self.assertNotIn('phone',json.dumps(me).lower())
        snapshot=self.patient_client.json(PORTAL+f'/visits/{self.visit}')
        self.assertEqual(snapshot['visitUuid'],self.visit)
        self.assertEqual(snapshot['version'],1)
        self.assertEqual(len(self.patient_client.json(PORTAL+f'/prescriptions/{publication["uuid"]}')['results']),1)
        self.assertEqual(self.patient_client.json(PORTAL+f'/results/{publication["uuid"]}')['results'],[])
        instructions=self.patient_client.json(PORTAL+f'/visits/{self.visit}/instructions')
        self.assertIn('exam.loi_dan',[r['field'] for r in instructions['items']])
        self.assertNotIn('history.benh_su',json.dumps(instructions))
        single=self.patient_client.json(PORTAL+'/visits?limit=1&offset=0')
        self.assertEqual(len(single['results']),1)
        self.assertEqual((single['limit'],single['offset'],single['hasMore']),(1,0,False))
        self.assertEqual(self.patient_client.json(PORTAL+'/visits?limit=1&offset=1')['results'],[])
        self.assertEqual(self.patient_client.request(PORTAL+'/visits?limit=0')[0],400)
        self.done('Only explicit finalized publication exposes whitelisted instructions')
    def test_02_patient_isolation(self):
        self.assertEqual(self.other_client.json(PORTAL+'/visits')['results'],[])
        self.assertEqual(self.other_client.request(PORTAL+f'/visits/{self.visit}')[0],403)
        self.assertEqual(self.other_client.request(PORTAL+f'/prescriptions/{self.publication_uuid}')[0],403)
        self.assertEqual(self.other_client.request(PORTAL+f'/results/{self.publication_uuid}')[0],403)
        self.assertEqual(self.other_client.request(PORTAL+f'/visits/{self.visit}/instructions')[0],403)
        self.assertEqual(self.flow.admin.request(PORTAL+'/accounts',method='POST',payload={
            'userUuid':self.patient_user,'patientUuid':self.other_client.json(PORTAL+'/session')['patientUuid']})[0],400)
        self.assertEqual(self.flow.call('manager',PORTAL+'/accounts',method='POST',payload={
            'userUuid':self.patient_user,'patientUuid':self.patient})[0],403)
        self.assertEqual(self.patient_client.request(API+f'/encounter/{self.encounter}/clinical-summary')[0],403)
        self.assertEqual(self.patient_client.request(REST+'/patient/'+self.patient)[0],403)
        self.assertEqual(self.patient_client.request('/openmrs/ws/fhir2/R4/Patient/'+self.patient)[0],403)
        self.assertEqual(self.patient_client.request(PORTAL+f'/visits/{self.visit}/publication',method='POST',payload={'encounterUuid':self.encounter,'sections':['instructions','prescriptions']})[0],403)
        self.assertEqual(self.flow.call('manager',PORTAL+f'/visits/{self.visit}/publication',
            method='POST',payload={'encounterUuid':self.encounter,'sections':['instructions']})[0],403)
        self.assertEqual(self.patient_client.json(PORTAL+'/appointments')['results'],[])
        self.assertTrue(self.patient_client.json(PORTAL+'/appointments')['publicationRequired'])
        self.done('Other patients, staff/Core/FHIR APIs and publication writes are denied')
    def test_02b_portal_url_attack_matrix(self):
        """Every route is checked by the server, never by a URL or user-provided patient ID."""
        pub=self.flow.get('doctor',PORTAL+f'/visits/{self.visit}/publication/history')['results'][0]['publication_uuid']
        fake=str(uuid.uuid4())
        attacks=[
            (self.other_client,PORTAL+f'/visits/{self.visit}'),
            (self.other_client,PORTAL+f'/visits/{self.visit}/instructions'),
            (self.other_client,PORTAL+f'/prescriptions/{pub}'),
            (self.other_client,PORTAL+f'/results/{pub}'),
            (self.other_client,PORTAL+f'/attachments/{pub}/content'),
            (self.patient_client,PORTAL+f'/attachments/{fake}/content'),
            (self.other_client,API+f'/encounter/{self.encounter}/clinical-summary'),
            (self.patient_client,REST+'/patient/'+self.patient),
            (self.patient_client,REST+'/user'),
            (self.patient_client,'/openmrs/ws/fhir2/R4/Patient/'+self.patient),
            (self.patient_client,PORTAL+f'/results/{fake}'),
            (self.patient_client,PORTAL+f'/prescriptions/{fake}'),
        ]
        spoofed=Client(self.other_client.base_url,self.other_client.username,self.other_client.password,
            default_headers={'X-VinSHC-Workspace-Role':'doctor',
                'X-VinSHC-Workspace-Facility':self.flow.facility['locationUuid'],
                'X-Patient-UUID':self.patient})
        attacks.append((spoofed,PORTAL+f'/visits/{self.visit}'))
        for client,path in attacks:
            with self.subTest(path=path):
                status=client.request(path)[0]
                self.assertIn(status,(403,404),f'Unexpected access {status}: {path}')
        self.assertEqual(self.other_client.json(PORTAL+f'/visits?patient={self.patient}')['results'],[])
        self.done('13 URL/UUID/header attacks denied; forged patient query cannot change authenticated scope')

    def test_02c_real_browser_two_tabs_and_mobile(self):
        import subprocess
        env=os.environ.copy()
        env.update({
            'P4_PORTAL_A_USER':self.patient_client.username,
            'P4_PORTAL_A_PASSWORD':self.patient_client.password,
            'P4_PORTAL_B_USER':self.other_client.username,
            'P4_PORTAL_B_PASSWORD':self.other_client.password,
            'P4_PORTAL_VISIT':self.visit,
        })
        script=ROOT/'infra/frontend/tests/browser/live-portal-check.cjs'
        result=subprocess.run(['node',str(script)],env=env,cwd=ROOT/'infra/frontend',
                              capture_output=True,text=True,timeout=120)
        self.assertEqual(result.returncode,0,(result.stdout+'\n'+result.stderr)[-1800:])
        self.assertIn('real OpenMRS desktop/mobile portal',result.stdout)
        self.done('Two accounts in two real desktop tabs and mobile: no chart cross-contamination, no browser storage')

    def test_03_agent_reads_real_backend_through_proxy(self):
        doctor=self.doctor_agent.json('/agent/v1/doctor/chat',method='POST',payload={'patientUuid':self.patient,'encounterUuid':self.encounter,'visitUuid':self.visit,'message':'Tóm tắt lần khám'},timeout=90)
        self.assertEqual(doctor['status'],'ok');self.assertTrue(doctor['answer'])
        self.assertNotIn('0912345678',json.dumps(doctor));self.assertTrue(all(a['sources'] for a in doctor['answer']))
        patient=self.patient_agent.json('/agent/v1/patient/chat',method='POST',payload={'message':'Lời dặn của tôi?','visitUuid':self.visit},timeout=90)
        self.assertEqual(patient['status'],'ok');self.assertTrue(any('Lời dặn synthetic' in a['text'] for a in patient['answer']))
        status,_,body=self.flow.admin.request(API+'/authorization/audit?patient='+self.patient)
        self.assertEqual(status,200);self.assertTrue(any((e.get('detail') or '').startswith('agent:') for e in json.loads(body)))
        self.done('Doctor/patient agent reads real OpenMRS, preserves sources and redaction; audit marks agent')
    def test_03a_real_doctor_chat_ui(self):
        import subprocess
        doctor=self.flow.staff['doctor']
        env={**os.environ,'P5_DOCTOR_USER':doctor.username,'P5_DOCTOR_PASSWORD':doctor.password,
             'P5_PATIENT_UUID':self.patient,'P5_VISIT_UUID':self.visit,'P5_ENCOUNTER_UUID':self.encounter}
        result=subprocess.run(['node','tests/browser/live-doctor-agent-check.cjs'],cwd=ROOT/'infra/frontend',
                              env=env,capture_output=True,text=True,encoding='utf-8',timeout=240)
        self.assertEqual(result.returncode,0,(result.stdout+'\n'+result.stderr)[-1800:])
        self.assertIn('real doctor desktop/mobile',result.stdout)
        self.done('Doctor desktop/mobile chat reads real backend through the web proxy and opens authorized sources')

    @unittest.skipUnless(os.environ.get('VINSHC_TEST_AGENT_ADVANCED')=='true','advanced synthetic acceptance overlay required')
    def test_03b_advanced_agent_uses_real_backend_and_scoped_sources(self):
        context={'patientUuid':self.patient,'encounterUuid':self.encounter,'visitUuid':self.visit}
        def chat(message,**extra):
            return self.doctor_agent.json('/agent/v1/doctor/chat',method='POST',payload={**context,'message':message,**extra},timeout=90)
        timeline=chat('Timeline toàn bộ lịch sử')
        self.assertEqual(timeline['status'],'ok')
        self.assertIn('get_patient_timeline',timeline['toolsUsed'])
        self.assertTrue(timeline['answer'])
        self.assertTrue(all(a['sources'] for a in timeline['answer']))
        previous=chat('So sánh với lần khám trước')
        self.assertEqual(previous['status'],'not_found')
        self.assertTrue(any(m['reason']=='no_previous_visit' for m in previous['missing']))
        first=chat('Tóm tắt lần khám',remember=True)
        session=first['conversationId']
        self.assertEqual(first['conversationRevision'],1)
        second=chat('Chi tiết hơn',remember=True,conversationId=session)
        self.assertEqual(second['conversationRevision'],2)
        self.assertEqual(second['conversationId'],session)
        self.assertEqual(self.patient_agent.request('/agent/v1/patient/conversations/'+session,method='DELETE')[0],404)
        self.assertTrue(self.doctor_agent.json('/agent/v1/doctor/conversations/'+session,method='DELETE')['deleted'])
        reference=chat('Theo tài liệu unknown khác not_asked thế nào?')
        self.assertEqual(reference['status'],'ok')
        source=next(s for a in reference['answer'] for s in a['sources'] if s['kind']=='document')
        chunk=self.doctor_agent.json('/agent/v1/doctor/knowledge/chunks/'+source['uuid'])
        self.assertEqual(chunk['documentVersion'],source['documentVersion'])
        self.assertEqual(self.patient_agent.request('/agent/v1/patient/knowledge/chunks/'+source['uuid'])[0],404)
        status,headers,stream=self.doctor_agent.request('/agent/v1/doctor/chat',method='POST',payload={**context,'message':'Sinh hiệu đã ghi','stream':True},timeout=90)
        self.assertEqual(status,200)
        self.assertIn('text/event-stream',headers.get('Content-Type',''))
        self.assertIn(b'event: final',stream)
        self.assertIn(b'event: done',stream)
        self.done('Advanced HTTP backend: timeline, missing prior, scoped memory, document citations and validated SSE')

    def test_04_unassigned_doctor_is_denied(self):
        username,password,person,_=self.fixtures.user_with_role('doctor',[self.flow.facility['locationUuid']])
        original=self.flow.staff['doctor']
        client=Client(self.doctor_agent.base_url,username,password,default_headers=original.default_headers)
        result=client.json('/agent/v1/doctor/chat',method='POST',payload={'patientUuid':self.patient,'encounterUuid':self.encounter,'message':'Tóm tắt'},timeout=90)
        self.assertEqual(result['status'],'limited');self.assertEqual(result['answer'],[])
        self.assertTrue(any(g['reason']=='forbidden' for g in result['missing']))
        self.done('Same-facility doctor without patient assignment cannot read via agent')
    def test_05_change_hides_old_publication_until_republished(self):
        self.flow.ok('doctor',API+f'/drug-order/{self.order}/discontinue',{'reason':'Synthetic correction','orderer':self.flow.providers['doctor']})
        self.assertEqual(self.patient_client.json(PORTAL+'/visits')['results'],[])
        self.assertEqual(self.flow.call('doctor',PORTAL+f'/visits/{self.visit}/publication',
            method='POST',payload={'encounterUuid':self.encounter,'sections':['instructions','prescriptions']})[0],400)
        publication=self.flow.ok('doctor',PORTAL+f'/visits/{self.visit}/publication',
            {'encounterUuid':self.encounter,'sections':['instructions']})
        self.assertEqual(publication['version'],2)
        self.assertEqual(self.patient_client.json(PORTAL+'/prescriptions')['results'],[])
        self.assertEqual(self.patient_client.json(PORTAL+'/results')['results'],[])
        self.flow.ok('lab',care.OPS+f'/service-orders/{self.lab_order}/transition',
                     {'state':'assigned','assignedProvider':self.flow.providers['lab']})
        self.flow.ok('lab',care.OPS+f'/service-orders/{self.lab_order}/transition',{'state':'in_progress'})
        now=datetime.now(timezone.utc).isoformat()
        result=self.flow.ok('lab',care.OPS+f'/service-orders/{self.lab_order}/results',{
            'state':'final','numericValue':91,'unit':'mg/dL',
            'authorProvider':self.flow.providers['lab'],'reviewerProvider':self.flow.providers['lab'],
            'recordedAt':now,'reviewedAt':now},statuses=(201,))
        self.flow.ok('lab',care.OPS+f'/service-orders/{self.lab_order}/transition',{'state':'completed'})
        self.assertEqual(self.patient_client.json(PORTAL+'/visits')['results'],[])
        published_result=self.flow.ok('doctor',PORTAL+f'/visits/{self.visit}/publication',{
            'encounterUuid':self.encounter,'sections':['results']})
        self.assertEqual(published_result['version'],3)
        diagnostic=self.patient_client.json(PORTAL+'/results?limit=1')['results']
        self.assertEqual(len(diagnostic),1)
        self.assertEqual(diagnostic[0]['resultUuid'],result['uuid'])
        self.assertEqual(diagnostic[0]['unit'],'mg/dL')
        self.assertEqual(diagnostic[0]['version'],1)
        self.assertEqual(self.patient_client.json(PORTAL+'/prescriptions')['results'],[])
        self.assertEqual(self.patient_client.json(PORTAL+f'/visits/{self.visit}/instructions')['items'],[])
        self.assertEqual(self.flow.call('doctor',PORTAL+f'/visits/{self.visit}/publication/revoke',
            method='POST',payload={})[0],400)
        self.flow.ok('doctor',PORTAL+f'/visits/{self.visit}/publication/revoke',{'reason':'Synthetic test revoke'})
        self.assertEqual(self.patient_client.json(PORTAL+'/visits')['results'],[])
        history=self.flow.get('doctor',PORTAL+f'/visits/{self.visit}/publication/history')
        self.assertEqual([e['status'] for e in history['results']],
                         ['published','superseded','published','superseded','published','revoked'])
        self.done('Source changes invalidate snapshots; republish versions and revocation are enforced')
    def test_06_account_revocation(self):
        self.flow.admin.json(PORTAL+'/accounts/'+self.patient_user+'/revoke',method='POST',payload={'reason':'Synthetic test'})
        self.assertEqual(self.patient_client.request(PORTAL+'/session')[0],403)
        self.assertEqual(self.flow.admin.request(PORTAL+'/accounts/'+self.patient_user+'/verify',
            method='POST',payload={'verificationMethod':'in_person_document'})[0],400)
        events=self.flow.admin.json(PORTAL+'/accounts/'+self.patient_user+'/history')['results']
        self.assertEqual([e['status'] for e in events],['pending','active','revoked'])
        self.assertEqual(events[-1]['reason'],'Synthetic test')
        # A retired synthetic OpenMRS User cannot be reactivated through account linking.
        self.flow.admin.request(REST+'/user/'+self.patient_user+'?reason=P3%20synthetic%20retirement',method='DELETE')
        self.assertEqual(self.flow.admin.request(PORTAL+'/accounts',method='POST',
            payload={'userUuid':self.patient_user,'patientUuid':self.patient})[0],400)
        self.done('Account revocation blocks portal reads and retired identity cannot relink')

    def test_07_patient_self_password_change(self):
        previous=self.other_client
        new_password='New!'+uuid.uuid4().hex+'xyz'
        status, _, payload=previous.request(PORTAL+'/password',method='POST',payload={
            'currentPassword':previous.password,'newPassword':new_password})
        self.assertEqual(status,200,payload.decode('utf-8',errors='replace')[:400])
        response=json.loads(payload)
        self.assertNotIn(previous.password,json.dumps(response))
        self.assertNotIn(new_password,json.dumps(response))
        self.assertNotIn('passwordHash',response)
        self.assertNotIn('password',response)
        changed=Client(self.flow.base,previous.username,new_password)
        self.assertEqual(changed.json(PORTAL+'/me')['linkStatus'],'active')
        self.assertIn(previous.request(PORTAL+'/me')[0],(401,403))
        self.done('Portal patient changes password using own current password; original credentials stop working')

if __name__=='__main__':unittest.main()
