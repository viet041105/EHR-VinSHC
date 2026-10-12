import { defineConfig } from 'vite';
// Keep credentials on the same origin; never expose OpenMRS to the LAN.
const target = process.env.VINSHC_BACKEND_ORIGIN || 'http://127.0.0.1:8080';
const url = new URL(target);
if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
 throw new Error('VINSHC_BACKEND_ORIGIN phải là HTTP origin loopback, không kèm đường dẫn.');
}
export default defineConfig({server:{fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/.runtime/**']},proxy:{'/openmrs':{target:url.origin,changeOrigin:true,timeout:15000,proxyTimeout:15000}}}});
