
async function testLogin() {
    console.log("Fetching CSRF token...");
    const csrfRes = await fetch('https://www.pontualidade.pt/api/auth/csrf');
    const csrfData = await csrfRes.json();
    const csrfToken = csrfData.csrfToken;
    const cookies = csrfRes.headers.get('set-cookie');
    
    let cookieStr = '';
    if (cookies) {
        cookieStr = cookies.split(',').map(c => c.split(';')[0]).join('; ');
    }

    console.log("Attempting login...");
    const loginRes = await fetch('https://www.pontualidade.pt/api/auth/callback/credentials', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookieStr
        },
        body: new URLSearchParams({
            csrfToken: csrfToken,
            username: 'CMB',
            password: 'CMB2026',
            json: 'true'
        }).toString(),
        redirect: 'manual'
    });

    console.log("Status:", loginRes.status);
    console.log("Location:", loginRes.headers.get('location'));
}

testLogin().catch(console.error);
