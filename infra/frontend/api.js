/** Session probe only. Workspace clinical data remains demo until an API repository replaces it. */
export class ApiError extends Error {
 constructor(message,kind){super(message);this.kind=kind;}
}
export async function authenticateSession({origin='',username,password},fetcher=fetch){
 const base=new URL(origin||window.location.origin);
 if(!['http:','https:'].includes(base.protocol)||!['localhost','127.0.0.1','[::1]'].includes(base.hostname)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new ApiError('Bản thử nghiệm chỉ cho phép origin localhost, không kèm đường dẫn.','config');
 if(!username.trim()||!password)throw new ApiError('Cần tên đăng nhập và mật khẩu.','validation');
 const bytes=new TextEncoder().encode(username+':'+password);
 const token=btoa(String.fromCharCode(...bytes));
 let response;
 try{response=await fetcher(new URL('/openmrs/ws/rest/v1/session',base),{headers:{Accept:'application/json',Authorization:'Basic '+token},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(12000)});}catch{throw new ApiError('Không kết nối được OpenMRS. Kiểm tra server, gateway và CORS.','network');}
 if(response.status===401||response.status===403)throw new ApiError('Thông tin đăng nhập bị từ chối hoặc tài khoản không có quyền.','unauthorized');
 if(!response.ok)throw new ApiError('OpenMRS trả lỗi HTTP '+response.status+'.','server');
 if(!response.headers.get('content-type')?.includes('json'))throw new ApiError('Server không trả JSON của OpenMRS; kiểm tra địa chỉ gateway.','response');
 let result;try{result=await response.json();}catch{throw new ApiError('Phản hồi API không đọc được.','response');}
 if(result?.authenticated!==true||!result.user?.uuid)throw new ApiError('Phiên chưa xác thực. Kiểm tra tên đăng nhập và mật khẩu.','unauthorized');
 return {uuid:result.user.uuid,display:result.user.display||username};
}
