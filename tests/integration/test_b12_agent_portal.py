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
        cls.patient_client,cls.patient_user=cls.portal_account(cls.patient)
        other=cls.flow.ok('reception',API+'/patients',cls.flow.registration(familyName='Synthetic',middleName='Portal'+care.letters(8),givenName='Khác',
            identifiers=[{'type':'cccd','identifier':str(100000000000+int(uuid.uuid4().hex[:10],16)%899999999999)}]),statuses=(201,))['uuid']
        cls.other_client,_=cls.portal_account(other)
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
        assert linked['active']
        return Client(cls.flow.base,username,password),user['uuid']
    @classmethod
    def tearDownClass(cls):
        report={'passed':len(cls.checks)==6,'checks':cls.checks,'model':'fake','clinicalEvaluationDeferred':True}
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
        self.assertEqual(self.flow.call('doctor',PORTAL+f'/visits/{self.visit}/publication',method='POST',payload={'encounterUuid':self.encounter})[0],400)
        self.flow.ok('doctor',API+f'/encounter/{self.encounter}/finalize',{})
        self.assertEqual(self.patient_client.json(PORTAL+'/visits')['results'],[])
        publication=self.flow.ok('doctor',PORTAL+f'/visits/{self.visit}/publication',{'encounterUuid':self.encounter})
        self.assertEqual(publication['version'],1)
        instructions=self.patient_client.json(PORTAL+f'/visits/{self.visit}/instructions')
        self.assertIn('exam.loi_dan',[r['field'] for r in instructions['items']])
        self.assertNotIn('history.benh_su',json.dumps(instructions))
        self.done('Only explicit finalized publication exposes whitelisted instructions')
    def test_02_patient_isolation(self):
        self.assertEqual(self.other_client.json(PORTAL+'/visits')['results'],[])
        self.assertEqual(self.other_client.request(PORTAL+f'/visits/{self.visit}/instructions')[0],403)
        self.assertEqual(self.patient_client.request(API+f'/encounter/{self.encounter}/clinical-summary')[0],403)
        self.assertEqual(self.patient_client.request(REST+'/patient/'+self.patient)[0],403)
        self.assertEqual(self.patient_client.request('/openmrs/ws/fhir2/R4/Patient/'+self.patient)[0],403)
        self.assertEqual(self.patient_client.request(PORTAL+f'/visits/{self.visit}/publication',method='POST',payload={'encounterUuid':self.encounter})[0],403)
        self.done('Other patients, staff/Core/FHIR APIs and publication writes are denied')
    def test_03_agent_reads_real_backend_through_proxy(self):
        doctor=self.doctor_agent.json('/agent/v1/doctor/chat',method='POST',payload={'patientUuid':self.patient,'encounterUuid':self.encounter,'visitUuid':self.visit,'message':'Tóm tắt lần khám'},timeout=90)
        self.assertEqual(doctor['status'],'ok');self.assertTrue(doctor['answer'])
        self.assertNotIn('0912345678',json.dumps(doctor));self.assertTrue(all(a['sources'] for a in doctor['answer']))
        patient=self.patient_agent.json('/agent/v1/patient/chat',method='POST',payload={'message':'Lời dặn của tôi?','visitUuid':self.visit},timeout=90)
        self.assertEqual(patient['status'],'ok');self.assertTrue(any('Lời dặn synthetic' in a['text'] for a in patient['answer']))
        status,_,body=self.flow.admin.request(API+'/authorization/audit?patient='+self.patient)
        self.assertEqual(status,200);self.assertTrue(any((e.get('detail') or '').startswith('agent:') for e in json.loads(body)))
        self.done('Doctor/patient agent reads real OpenMRS, preserves sources and redaction; audit marks agent')
    def test_04_unassigned_doctor_is_denied(self):
        username,password,person=self.fixtures.user_with_role('doctor',[self.flow.facility['locationUuid']])
        original=self.flow.staff['doctor']
        client=Client(self.doctor_agent.base_url,username,password,default_headers=original.default_headers)
        result=client.json('/agent/v1/doctor/chat',method='POST',payload={'patientUuid':self.patient,'encounterUuid':self.encounter,'message':'Tóm tắt'},timeout=90)
        self.assertEqual(result['status'],'limited');self.assertEqual(result['answer'],[])
        self.assertTrue(any(g['reason']=='forbidden' for g in result['missing']))
        self.done('Same-facility doctor without patient assignment cannot read via agent')
    def test_05_change_hides_old_publication_until_republished(self):
        self.flow.ok('doctor',API+f'/drug-order/{self.order}/discontinue',{'reason':'Synthetic correction','orderer':self.flow.providers['doctor']})
        self.assertEqual(self.patient_client.json(PORTAL+'/visits')['results'],[])
        publication=self.flow.ok('doctor',PORTAL+f'/visits/{self.visit}/publication',{'encounterUuid':self.encounter})
        self.assertEqual(publication['version'],2)
        self.assertEqual(self.patient_client.json(PORTAL+'/prescriptions')['results'][0]['status'],'discontinued')
        self.flow.ok('doctor',PORTAL+f'/visits/{self.visit}/publication',method='DELETE')
        self.assertEqual(self.patient_client.json(PORTAL+'/visits')['results'],[])
        self.done('Source changes invalidate snapshots; republish versions and revocation are enforced')
    def test_06_account_revocation(self):
        self.flow.admin.json(PORTAL+'/accounts/'+self.patient_user,method='DELETE')
        self.assertEqual(self.patient_client.request(PORTAL+'/session')[0],403)
        self.done('Account revocation blocks portal reads immediately')

if __name__=='__main__':unittest.main()
