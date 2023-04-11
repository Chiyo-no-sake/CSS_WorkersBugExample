import fetch from 'node-fetch'
import { generateDpopKeyPair, createDpopHeader, buildAuthenticatedFetch } from '@inrupt/solid-client-authn-core'
import { createContainerAt, getSourceUrl } from '@inrupt/solid-client'

async function login(tid, email, password) {
  console.log(`[${tid}] Logging in as`, email)
  let response = await fetch('https://localhost/idp/credentials/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      name: 'my-token',
    }),
  })

  if(!response.ok){
    throw new Error(`[${tid}] Failed to get credentials: ${response.status}, ${await response.text()}`)
  }

  const { id, secret } = await response.json()
  const dpopKey = await generateDpopKeyPair()
  const authString = `${encodeURIComponent(id)}:${encodeURIComponent(secret)}`
  const tokenUrl = 'https://localhost/.oidc/token'

  response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(authString).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
      dpop: await createDpopHeader(tokenUrl, 'POST', dpopKey),
    },
    body: 'grant_type=client_credentials&scope=webid',
  })

  if(!response.ok){
    throw new Error(`[${tid}] Failed to get token`)
  }

  
  const json = await response.json()
  const { access_token: accessToken } = json;

  console.log(`[${tid}] Logged in as`, email)

  const authFetch = await buildAuthenticatedFetch(fetch, accessToken, { dpopKey });
  return authFetch;
}

async function findStorage(tid, webId, fetch) {
  console.log(`[${tid}] Finding storage for`, webId)
  let found = false;

  const prefixEnds = webId.lastIndexOf('://') + 3;
  const prefix = webId.slice(0, prefixEnds);
  let currentUrl = webId.slice(prefixEnds);

  while (!found) {
    if (currentUrl.indexOf('/') == -1) break;

    const res = await fetch(prefix + currentUrl, {
      method: 'HEAD',
    });

    if(!res.ok){
      throw new Error(`[${tid}] Failed to get storage on url: ${currentUrl}`)
    }

    if (res.headers) {
      const linkHeader = res.headers.get('link');

      if (linkHeader && linkHeader?.indexOf('<http://www.w3.org/ns/pim/space#Storage>; rel="type"') !== -1) {
        found = true;
      } else {
        currentUrl = currentUrl.slice(0, -1);
        currentUrl = currentUrl.slice(0, currentUrl.lastIndexOf('/') + 1);
      }
    }
  }

  if (found) {
    console.log(`[${tid}] Found storage for`, webId)
    return prefix + currentUrl;
  } else {
    throw new Error(`[${tid}] No pim::storage found on user pod`);
  }
}

async function createContainer(tid, {url, fetch}) {
  try{
    console.log(`[${tid}] Creating container at`, url)
    if(!url){
      console.log(`[${tid}] No url provided, skipping`)
      return
    }
    const container = await createContainerAt(url, {
      fetch,
    })
    console.log(`[${tid}] Created container at`, url)

    return getSourceUrl(container)
  }catch(e){
    console.log(`[${tid}] Failed to create container. Already exists? ${e.message}`)
  }
}

async function createPod(tid, {name, email, password}) {
  console.log(`[${tid}] Creating pod`, name, "with email", email)
  const resp = await fetch('https://localhost/idp/register/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      confirmPassword: password,
      createWebId: true,
      register: true,
      createPod: true,
      podName: name,
    }),
  });

  if(!resp.ok){
    console.log(`[${tid}] Failed to create pod, already exists? ${await resp.text()}`)
  }else{
    console.log(`[${tid}] Created pod`, name, "with email", email)
  }
}


function runPX(x) {
  const podName = `p${x}`;
  const podData = {
    name: `example${x}`,
    email: `example${x}@example.com`,
    password: 'example'
  };

  const podPromise = createPod(podName, podData).then(async () => {
    return login(podName, podData.email, podData.password).then(async (fetch) => {
      const storage = await findStorage(podName, `https://localhost/example${x}/profile/card#me`, fetch);

      const containerPromises = [];

      for (let i = 1; i <= 5; i++) {
        const containerUrl = `${storage}container${i}/`;
        const nestedContainerUrl = `${containerUrl}nestedContainer/`;

        const containerPromise = createContainer(podName, {
          url: containerUrl,
          fetch
        }).then(async () => {
          await createContainer(podName, {
            url: nestedContainerUrl,
            fetch
          });
        });

        containerPromises.push(containerPromise);
      }

      await Promise.all(containerPromises);
      await findStorage(podName, `https://localhost/example${x}/profile/card#me`, fetch);
      console.log(`[${podName}] Done`);
    });
  });

  return podPromise;
}

/* 
 * start X sequences of requests for 2 different users, in parallel:
  * - create pod
  * - login
  * - find storage
  * - create some containers, each with one nested
  * - find storage again
  * 
  * Every job that terminates will print "Done", the others are locked.
 */ 

Promise.all([runPX(1), runPX(2), runPX(3)]).then(() => {
  console.log("Test finished")
});
