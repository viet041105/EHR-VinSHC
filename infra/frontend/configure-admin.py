"""Enable the existing local root admin's application workspace; no demo accounts."""
import sys,json
from pathlib import Path
runtime=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(runtime/'scripts'))
from common import read_settings
from api_client import Client
settings=read_settings(runtime)
client=Client('http://127.0.0.1:'+settings.get('EHR_HTTP_PORT','8080'),settings['EHR_ADMIN_USERNAME'],settings['EHR_ADMIN_PASSWORD'])
session=client.json('/openmrs/ws/rest/v1/session?v=full')
user=client.json('/openmrs/ws/rest/v1/user/'+session['user']['uuid']+'?v=full')
if not any(r.get('name')=='System Developer' for r in user['roles']):
    raise RuntimeError('This bootstrap requires the existing system administrator.')
permissions=json.loads((runtime/'metadata/vinshc/permissions.json').read_text(encoding='utf-8'))
role=permissions['roles']['admin']['openmrs']
roles=[r['uuid'] for r in user['roles']]
if role['uuid'] not in roles:
    client.json('/openmrs/ws/rest/v1/user/'+user['uuid'],method='POST',payload={'roles':roles+[role['uuid']]},statuses=(200,201))
facility=json.loads((runtime/'metadata/vinshc/catalogues/facilities.json').read_text(encoding='utf-8'))['records'][0]
headers={'X-VinSHC-Workspace-Role':'admin','X-VinSHC-Workspace-Facility':facility['locationUuid']}
scoped=Client(client.base_url,client.username,client.password,default_headers=headers)
status,_,_=scoped.request('/openmrs/ws/rest/v1/vinshc/authorization/workspace')
if status==403:
    client.json('/openmrs/ws/rest/v1/vinshc/authorization/assignment',method='POST',payload={'user':user['uuid'],'role':'admin','facility':facility['locationUuid']},statuses=(200,201))
elif status!=200:
    raise RuntimeError('Workspace validation failed; no assignment changed.')
verified=scoped.json('/openmrs/ws/rest/v1/vinshc/authorization/workspace')
assert verified['role']=='admin' and verified['facilityUuid']==facility['locationUuid']
print('Existing admin configured: VinSHC App: admin + '+facility['name']+'. Existing Core roles preserved; no accounts/patients generated.')
