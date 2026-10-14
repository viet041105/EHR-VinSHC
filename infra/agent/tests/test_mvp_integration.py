import asyncio
import json
import httpx
from fastapi.testclient import TestClient
from vinshc_agent.app import create_app
from vinshc_agent.config import Settings
from vinshc_agent.facts import FactRegistry, Source
from vinshc_agent.llm import FinalAnswer, Statement
from vinshc_agent.portal import HttpPortal
from vinshc_agent.validate import validate
from vinshc_agent import records
from conftest import HEADERS, PATIENT, ENCOUNTER, VISIT, doctor_body, summary_payload


def test_real_summary_allergy_contract(make_client):
    response=make_client().post('/v1/doctor/chat',headers=HEADERS,json=doctor_body('Tóm tắt lần khám'))
    assert response.status_code==200 and response.json()['status']=='ok'
    assert any('Penicillin' in a['text'] for a in response.json()['answer'])


def test_clinical_values_are_rendered_from_sources_even_with_misleading_prose():
    registry=FactRegistry()
    a=registry.add('vitals','Huyết áp tâm thu','120 mmHg','recorded',Source('vitals','synthetic',None,None,'recorded'))
    b=registry.add('vitals','Huyết áp tâm trương','80 mmHg','recorded',Source('vitals','synthetic',None,None,'recorded'))
    final=FinalAnswer(scope='answered',statements=[Statement(text='Huyết áp 80/120 mmHg.',fact_ids=[a.id,b.id])])
    accepted=validate(final,registry,'doctor').accepted
    assert len(accepted)==1
    assert accepted[0].statement.text=='Huyết áp tâm thu: 120 mmHg\nHuyết áp tâm trương: 80 mmHg'
    diagnosis=registry.add('diagnoses','Chẩn đoán chính','Viêm họng cấp','recorded',Source('diagnosis','synthetic',None,None,'confirmed'))
    final=FinalAnswer(scope='answered',statements=[Statement(text='Bạn bị ung thư phổi.',fact_ids=[diagnosis.id])])
    assert validate(final,registry,'patient').accepted[0].statement.text=='Chẩn đoán chính: Viêm họng cấp'


def test_identifier_in_clinical_free_text_is_redacted_before_tool_delivery(rec,catalog):
    source=summary_payload()
    source['consultation']['values']['history.benh_su']='Ghi chú synthetic: liên hệ 0912345678, demo@example.com.'
    records.clinical_summary(rec,source,catalog,PATIENT,ENCOUNTER)
    assert '0912345678' not in rec.output.to_model() and 'demo@example.com' not in rec.output.to_model()
    assert '[đã ẩn]' in rec.output.to_model()


def test_permission_failure_is_not_presented_as_empty_record(make_client,vinshc):
    vinshc.status['service-orders']=403
    response=make_client(vinshc).post('/v1/doctor/chat',headers=HEADERS,json=doctor_body('Kết quả xét nghiệm?')).json()
    assert response['status']=='limited' and any(m['reason']=='forbidden' for m in response['missing'])


def test_http_patient_portal_preserves_identity_and_credential():
    seen=[]
    def backend(request):
        seen.append(request)
        assert request.headers['authorization']=='Bearer synthetic'
        assert 'X-VinSHC-Workspace-Role' not in request.headers
        if request.url.path.endswith('/session'):return httpx.Response(200,json={'persona':'patient','patientUuid':PATIENT})
        return httpx.Response(200,json={'patientUuid':PATIENT,'results':[]})
    async def run():
        async with httpx.AsyncClient(base_url=Settings().backend_url+'/',transport=httpx.MockTransport(backend)) as http:
            portal=HttpPortal(http)
            session=await portal.authenticate('Bearer synthetic')
            assert session.patient_uuid==PATIENT
            assert (await portal.visits(session))['results']==[]
    asyncio.run(run())
    assert all(r.method=='GET' and '/vinshc/portal/' in r.url.path for r in seen)


def test_foreign_visit_is_rejected_before_patient_model(make_client):
    response=make_client().post('/v1/patient/chat',headers={'Authorization':'Bearer demo-patient-binh'},
        json={'message':'Lời dặn?','visitUuid':'b9999999-0000-4000-8000-000000000009'})
    assert response.status_code in (403,404)


def test_doctor_visit_must_match_encounter(make_client):
    response=make_client().post('/v1/doctor/chat',headers=HEADERS,json=doctor_body('Tóm tắt',visitUuid='b9999999-0000-4000-8000-000000000009'))
    assert response.status_code==502 and response.json()['code']=='context_mismatch'


def test_backend_session_cookie_cannot_cross_users():
    from vinshc_agent.backend import VinshcBackend, Credentials
    from conftest import FACILITY
    seen=[]
    def server(request):
        seen.append(request)
        assert not request.headers.get('cookie')
        return httpx.Response(200,json={'role':'doctor'},headers={'set-cookie':'JSESSIONID=first-user-session; Path=/'})
    async def run():
        async with httpx.AsyncClient(base_url=Settings().backend_url+'/',transport=httpx.MockTransport(server)) as http:
            backend=VinshcBackend(http)
            await backend.workspace(Credentials('Basic first','doctor',FACILITY))
            await backend.workspace(Credentials('Basic second','doctor',FACILITY))
            await HttpPortal(http)._get('Basic patient','visits')
    asyncio.run(run())
    assert [r.headers['authorization'] for r in seen]==['Basic first','Basic second','Basic patient']
