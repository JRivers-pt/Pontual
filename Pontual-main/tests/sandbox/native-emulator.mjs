// Pure in-memory emulator. No network, credentials or native SDK calls.
export function nativeEmulator() {
    const original={user_id:'1',name:'Protected synthetic admin',disabled:'false',permission:{id:'1'},login_id:'admin',updated_count:'1'};
    const users=new Map([['1',structuredClone(original)]]);
    const devices=new Map(['1','2','3'].map(id=>[id,new Map([['1',structuredClone(original)]]) ]));
    const offline=new Set();const calls=[];let failCreateResponse=false;
    const ok=body=>({status:200,headers:new Headers({'bs-session-id':'sandbox-session'}),body:{Response:{code:'0'},...body}});
    const transport=async(url,options={})=>{
        const u=new URL(url);
        if(u.origin!=='https://biostar.sandbox.invalid')throw new Error('EXTERNAL_NATIVE_REQUEST_BLOCKED');
        const method=options.method||'GET',p=u.pathname;calls.push({path:p,method});
        if(p==='/api/login'||p==='/api/logout')return ok({});
        if(p==='/api/v2/fingerprintFormat')return ok({Setting:{fingerprint_format:'0'}});
        if(p==='/api/server_matching/identify_finger'&&method==='POST'){
            const template=options.body?.ServerMatching?.template;
            const match=[...users.values()].find(user=>user.fingerprint_templates?.some(pair=>pair.template0===template||pair.template1===template));
            return match?ok({Response:{code:'0'},User:{user_id:match.user_id}}):{status:500,body:{Response:{code:'1201',message:'Failed to identify fingerprint.'}}};
        }
        const device=/^\/api\/devices\/([123])\/users$/.exec(p);
        if(device){
            const rows=[...devices.get(device[1]).values()].map(user=>({...user,fingerprint_templates_count:user.fingerprint_templates?.length||0}));
            const offset=Number(u.searchParams.get('offset')||0);
            return ok({UserCollection:{total:rows.length,rows:rows.slice(offset,offset+200)}});
        }
        if(p==='/api/users/export'){
            const terminal=options.body.DeviceCollection.rows[0].id;
            if(offline.has(terminal))return ok({DeviceResponse:{result:'false',rows:[{id:terminal,code:'500'}]}});
            const user=users.get(u.searchParams.get('id'));
            if(!user)throw new Error('MISSING_SYNTHETIC_USER');
            devices.get(terminal).set(user.user_id,structuredClone(user));
            return ok({DeviceResponse:{result:'true',rows:[{id:terminal,code:'0'}]}});
        }
        if(p==='/api/users'&&method==='POST'){
            const user=options.body.User;
            if(users.has(user.user_id)||!user.start_datetime||!user.expiry_datetime)return {status:400,body:{Response:{code:'800'}}};
            users.set(user.user_id,{...structuredClone(user),updated_count:'1'});
            if(failCreateResponse){failCreateResponse=false;throw new Error('SIMULATED_RESPONSE_LOST_AFTER_CREATE');}
            return ok({});
        }
        const match=/^\/api\/users\/(\d+)$/.exec(p);
        if(match){
            const user=users.get(match[1]);
            if(!user)return {status:400,body:{Response:{code:'201'}}};
            if(method==='PUT'){Object.assign(user,structuredClone(options.body.User));user.updated_count=String(Number(user.updated_count)+1);return ok({});}
            return ok({User:structuredClone(user)});
        }
        throw new Error('UNSUPPORTED_NATIVE_SANDBOX_PATH');
    };
    const assertOriginal=()=>JSON.stringify(users.get('1'))===JSON.stringify(original)&&[...devices.values()].every(d=>JSON.stringify(d.get('1'))===JSON.stringify(original));
    const reset=()=>{users.clear();users.set('1',structuredClone(original));for(const d of devices.values()){d.clear();d.set('1',structuredClone(original));}offline.clear();calls.length=0;};
    return {users,devices,offline,calls,transport,assertOriginal,reset,loseNextCreate:()=>{failCreateResponse=true;}};
}
