import {spawnSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {mkdirSync,readFileSync,existsSync,writeFileSync} from 'node:fs';
const fe=dirname(fileURLToPath(import.meta.url)),repo=resolve(fe,'../..'),runtime=join(fe,'.runtime/backend');
const source=JSON.parse(readFileSync(join(fe,'metadata/source.json'),'utf8'));
const command=process.argv[2]||'status';
function run(executable,args,options={}){const r=spawnSync(executable,args,{cwd:repo,stdio:'inherit',...options});if(r.status!==0)process.exit(r.status||1);}
if(command==='prepare'){
 mkdirSync(runtime,{recursive:true});
 const marker=join(runtime,'.frontend-source-commit');
 if(existsSync(marker)&&readFileSync(marker,'utf8').trim()!==source.commit)throw Error('Runtime đã dựng từ commit khác; không tự ghi đè môi trường đang có.');
 if(!existsSync(marker)){
  const archive=spawnSync('git',['archive',source.commit],{cwd:repo,maxBuffer:32*1024*1024});if(archive.status!==0)throw Error('Không đọc được backend commit đã khóa.');
  run('tar',['-x','-C',runtime],{input:archive.stdout,stdio:['pipe','inherit','inherit']});
  writeFileSync(marker,source.commit+'\n');
 }
 run('python3',[join(runtime,'scripts/bootstrap.py')]);
 console.log('Backend source:',source.commit,'; runtime:',runtime);
}else{
 if(!existsSync(join(runtime,'.env')))throw Error('Chạy npm run backend:prepare trước.');
 const args=['compose','--project-directory',runtime,'-f',join(runtime,'compose.yaml'),'-f',join(runtime,'tests/integration/compose.b4-metadata.yaml'),'-f',join(fe,'compose.local.yaml'),'-p','vinshc-fe-local'];
 const operations={build:['build','backend'],up:['up','-d','--no-build','--wait','--wait-timeout','2400'],status:['ps'],down:['down']};
 if(!operations[command])throw Error('Dùng prepare, build, up, status hoặc down.');
 const child=spawn('docker',[...args,...operations[command]],{cwd:repo,stdio:'inherit',env:command==='build'?{...process.env,DOCKER_DEFAULT_PLATFORM:'linux/amd64'}:process.env});
 child.on('error',()=>{console.error('Không chạy được Docker. Kiểm tra Docker Desktop.');process.exit(1);});
 child.on('exit',code=>process.exit(code??1));
}
