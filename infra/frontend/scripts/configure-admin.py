"""Enable the existing local root admin's application workspace; no demo accounts."""
import sys,json
from pathlib import Path
runtime=Path(__file__).resolve().parents[3]
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
app_role_ids={definition['openmrs']['uuid'] for definition in permissions['roles'].values()}
roles=[r['uuid'] for r in user['roles'] if r['uuid'] not in app_role_ids]
roles.append(role['uuid'])
if set(roles)!={r['uuid'] for r in user['roles']}:
    client.json('/openmrs/ws/rest/v1/user/'+user['uuid'],method='POST',payload={'roles':roles},statuses=(200,201))
facility=json.loads((runtime/'metadata/vinshc/catalogues/facilities.json').read_text(encoding='utf-8'))['records'][0]
headers={'X-VinSHC-Workspace-Role':'admin','X-VinSHC-Workspace-Facility':facility['locationUuid']}
scoped=Client(client.base_url,client.username,client.password,default_headers=headers)
# GET /authorization/workspace always answers 200 for a System Developer, so it cannot show whether an
# assignment exists. The login screen uses /authorization/workspaces (the stored assignments): require
# exactly admin@facility there and (re)assign otherwise; assigning deactivates any other active row.
wanted=[('admin',facility['locationUuid'])]
def current():
    stored=client.json('/openmrs/ws/rest/v1/vinshc/authorization/workspaces',statuses=(200,409))
    if isinstance(stored,dict):
        raise RuntimeError('Workspace lookup refused: '+str(stored.get('error')))
    return [(w['role'],w['facilityUuid']) for w in stored]
try: found=current()
except RuntimeError: found=None  # e.g. 409 conflict; the assignment below replaces it
if found!=wanted:
    client.json('/openmrs/ws/rest/v1/vinshc/authorization/assignment',method='POST',payload={'user':user['uuid'],'role':'admin','facility':facility['locationUuid']},statuses=(200,201))
    found=current()
if found!=wanted:
    raise RuntimeError('Admin workspace is still '+repr(found)+'; expected '+repr(wanted))
verified=scoped.json('/openmrs/ws/rest/v1/vinshc/authorization/workspace')
assert verified['role']=='admin' and verified['facilityUuid']==facility['locationUuid']
print('Existing admin configured with the single VinSHC role admin + '+facility['name']+'. Existing Core roles preserved; no accounts/patients generated.')
