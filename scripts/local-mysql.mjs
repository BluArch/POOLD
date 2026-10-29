// An isolated development instance. Never opens or edits another MySQL data directory.
import { mkdirSync, existsSync, openSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import net from 'node:net';
const base=resolve('.local/mysql');mkdirSync(base,{recursive:true});
const socket=resolve('.local/mysql.sock');
const run=(args)=>{const p=spawnSync('mysqld',args,{stdio:'inherit'});if(p.status)process.exit(p.status??1);};
if(!existsSync(`${base}/mysql`))run(['--no-defaults','--initialize-insecure',`--datadir=${base}`]);
const ready=()=>new Promise(r=>{const s=net.connect(3308,'127.0.0.1',()=>{s.destroy();r(true);});s.on('error',()=>r(false));});
if(!await ready()) {
 const fd=openSync(resolve('.local/mysql.log'),'a');
 const child=spawn('mysqld',['--no-defaults',`--datadir=${base}`,`--socket=${socket}`,'--port=3308','--bind-address=127.0.0.1','--mysqlx=OFF',`--pid-file=${resolve('.local/mysql.pid')}`],{detached:true,stdio:['ignore',fd,fd]});child.unref();
 for(let i=0;i<100&&!await ready();i++) await new Promise(r=>setTimeout(r,200));
}
const sql="CREATE DATABASE IF NOT EXISTS poold_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; CREATE DATABASE IF NOT EXISTS poold_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; CREATE USER IF NOT EXISTS 'poold'@'127.0.0.1' IDENTIFIED BY 'poold_local_only'; GRANT ALL ON poold_dev.* TO 'poold'@'127.0.0.1'; GRANT ALL ON poold_test.* TO 'poold'@'127.0.0.1';";
const p=spawnSync('mysql',['--no-defaults',`--socket=${socket}`,'-uroot','-e',sql],{stdio:'inherit'});
if(p.status)process.exit(p.status??1);console.log('Isolated MySQL ready on 127.0.0.1:3308 (poold_dev and poold_test).');
