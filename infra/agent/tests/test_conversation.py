"""Verify scoped transcript recall through model tool selection, not input phrase matching."""
import pytest
from conftest import HEADERS, ScriptedModel, answer, doctor_body, fact_ids
from vinshc_agent.llm import ModelTurn, ToolCall


@pytest.mark.parametrize('question', [
    'tôi mới nói gì', 'Nãy tôi nhắn câu nào nhỉ?', 'Bạn nhắc lại lời tôi vừa gửi với.',
    'What was my previous message?',
])
def test_model_receives_history_and_selects_recall_for_any_wording(make_client, question):
    class ChoosingModel(ScriptedModel):
        async def next_turn(self, system, tools, conversation):
            assert conversation.message == question
            assert [t.text for t in conversation.history if t.role == 'user'] == ['hello', 'chào']
            assert 'recall_conversation' in {t['name'] for t in tools}
            assert 'trong phạm vi' in system
            return await super().next_turn(system, tools, conversation)
    model = ChoosingModel([('recall_conversation', {'speaker': 'user', 'selection': 'last'})], answer())
    client = make_client(model=model, advanced_enabled=True)
    first = client.post('/v1/doctor/chat', headers=HEADERS, json=doctor_body('hello', remember=True)).json()
    client.post('/v1/doctor/chat', headers=HEADERS, json=doctor_body('chào', conversationId=first['conversationId']))
    result = client.post('/v1/doctor/chat', headers=HEADERS,
                         json=doctor_body(question, conversationId=first['conversationId'])).json()
    assert result['status'] == 'ok' and result['message'].endswith('Bạn: “chào”')
    assert result['toolsUsed'] == ['recall_conversation'] and result['answer'] == [] and result['notes'] == []
    assert result['diagnostics']['modelCalls'] == 2


def test_recall_of_assistant_is_labelled_as_old_conversation_not_a_fresh_chart_read(make_client):
    model = ScriptedModel([('recall_conversation', {'speaker': 'assistant', 'selection': 'last'})], answer())
    result = make_client(model=model).post('/v1/doctor/chat', headers=HEADERS,
        json=doctor_body('Nhắc lại lời bạn vừa trả lời.', history=[
            {'role': 'user', 'text': 'Mạch bao nhiêu?'},
            {'role': 'assistant', 'text': 'Mạch cũ là 999.'}])).json()
    assert 'Trợ lý: “Mạch cũ là 999.”' in result['message']
    assert 'không phải kết quả đọc lại hồ sơ hiện tại' in result['message']
    assert result['answer'] == []


def test_mixed_recall_and_clinical_request_keeps_clinical_sources_fresh(make_client):
    def final(conversation):
        return ModelTurn([], answer(('Mạch 92', fact_ids(conversation, 'Mạch'))))
    model = ScriptedModel([
        ('recall_conversation', {'speaker': 'user', 'selection': 'last'}),
        ('get_vitals_history', {'visit_ref': 'current'}),
    ], final)
    result = make_client(model=model, advanced_enabled=True).post('/v1/doctor/chat', headers=HEADERS,
        json=doctor_body('Nhắc câu tôi vừa hỏi và đọc lại mạch hiện tại.', history=[
            {'role': 'user', 'text': 'Mạch 999 đúng không?'},
            {'role': 'assistant', 'text': 'Đó chưa phải dữ liệu đã kiểm tra.'}])).json()
    assert 'Bạn: “Mạch 999 đúng không?”' in result['message']
    assert result['answer'] and all('999' not in a['text'] for a in result['answer'])
    assert all(s['kind'] == 'vitals' for a in result['answer'] for s in a['sources'])


def test_model_cannot_select_other_speakers_or_sessions(make_client):
    model = ScriptedModel([('recall_conversation', {'speaker': 'other_patient', 'selection': 'all', 'conversationId': 'foreign'})], answer(scope='not_found'))
    result = make_client(model=model).post('/v1/doctor/chat', headers=HEADERS, json=doctor_body('Nhắc hội thoại.')).json()
    assert result['status'] == 'not_found' and result['answer'] == []
    assert 'Trong phần hội thoại' not in result['message']


def test_direct_unsourced_answer_gets_one_correction_without_matching_input(make_client):
    class CorrectingModel(ScriptedModel):
        async def next_turn(self, system, tools, conversation):
            if conversation.exchanges:
                return ModelTurn([], answer())
            if not self.seen:
                self.seen.append(system)
                return ModelTurn([], answer(('Bạn đã nói một câu không kiểm chứng.', [])))
            assert 'Yêu cầu sửa phản hồi chưa đọc nguồn' in system
            return ModelTurn([ToolCall(
                'recall', 'recall_conversation', {'speaker': 'user', 'selection': 'last'})])
    result = make_client(model=CorrectingModel(), advanced_enabled=True).post('/v1/doctor/chat', headers=HEADERS,
        json=doctor_body('Nhắc câu trước nhé.', history=[{'role': 'user', 'text': 'chào'},
                                                     {'role': 'assistant', 'text': 'Chào bạn.'}])).json()
    assert result['message'].endswith('Bạn: “chào”') and result['answer'] == []
    assert result['diagnostics']['modelCalls'] == 3 and result['diagnostics']['sourceRepairs'] == 1


def test_correction_is_bounded_and_does_not_accept_unsourced_clinical_text(make_client):
    model = ScriptedModel(answer(('Mạch là 999.', [])))
    result = make_client(model=model, advanced_enabled=True).post('/v1/doctor/chat', headers=HEADERS,
        json=doctor_body('Mạch bao nhiêu?')).json()
    assert result['status'] == 'limited' and result['answer'] == []
    assert len(model.seen) == 2 and result['diagnostics']['sourceRepairs'] == 1


@pytest.mark.parametrize('scope', ['out_of_scope', 'not_found'])
def test_recall_does_not_bypass_final_scope_check(make_client, scope):
    model = ScriptedModel([('recall_conversation', {'speaker': 'user', 'selection': 'last'})], answer(scope=scope))
    result = make_client(model=model).post('/v1/doctor/chat', headers=HEADERS,
        json=doctor_body('Đọc thuốc trong hồ sơ.', history=[{'role': 'user', 'text': 'Câu hỏi cũ'},
                                                        {'role': 'assistant', 'text': 'Câu trả lời cũ'}])).json()
    assert result['status'] == scope and result['answer'] == []
    assert 'Câu hỏi cũ' not in result['message']
