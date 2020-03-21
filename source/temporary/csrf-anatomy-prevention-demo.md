---
title: Cross-Site Request Forgery Prevention
---
## Mitigation of CSRF

If maintaining the state for CSRF token at server side is problematic, an alternative defense is to use the double submit cookie technique. This technique is easy to implement and is stateless. In this technique, we send a random value in both a cookie and as a request parameter, with the server verifying if the cookie value and request value match. When a user visits (even before authenticating to prevent login CSRF), the site should generate a (cryptographically strong) pseudorandom value and set it as a cookie on the user's machine separate from the session identifier. The site then requires that every transaction request include this pseudorandom value as a hidden form value (or other request parameter/header). If both of them match at server side, the server accepts it as legitimate request and if they don't, it would reject the request.

Because subdomains can write cookies to the parent domains and because cookies can be set for the domain over plain HTTP connections this technique works as long as you are sure that your subdomains are fully secured and only accept HTTPS connections.

To enhance the security of this solution include the token in an encrypted cookie - other than the authentication cookie (since they are often shared within subdomains) - and then at the server side match it (after decrypting the encrypted cookie) with the token in hidden form field or parameter/header for ajax calls. This works because a sub domain has no way to over-write an properly crafted encrypted cookie without the necessary information such as encryption key.

A simpler alternative to an encrypted cookie is to hash the token with a secret salt known only by the server and place this value in a cookie. This is similar to an encrypted cookie (both require knowledge only the server holds), but is less computationally intensive than encrypting and decrypting the cookie. Whether encryption or a salted-hash is used, an attacker won't be able to recreate the cookie value from the plain token without knowledge of the server secrets.

```js
const express = require('express');
const bodyParser = require('body-parser');
const csurf = require('csurf');
const cookieParser = require('cookie-parser');

const PORT = process.env.PORT || 3000;
const app = express();

const csrfMiddleware = csurf({
  cookie: true
});

app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(cookieParser());
app.use(csrfMiddleware);

app.get('/', (req, res) => {
  res.send(`
    <h1>Hello World</h1>
    <form action="/entry" method="POST">
      <div>
        <label for="message">Enter a message</label>
        <input id="message" name="message" type="text" />
      </div>
      <input type="submit" value="Submit" />
      <input type="hidden" name="_csrf" value="${req.csrfToken()}" />
    </form>
  `);
});

app.get('/etag', (req, res) => {
  res.send(`
    <html>
      <header>
        <title> Etag - 304 demo </title>
      </header>
        <body>
          <h1>Etag - 304 demo</h1>
          <script type="text/javascript">
            var data = null;
          var xhr = new XMLHttpRequest();
          xhr.withCredentials = true;
          xhr.addEventListener("readystatechange", function () {
            if (this.readyState === 4) {
              console.log(this.responseText);
            }
          });
          xhr.open("GET", "/cache");
          xhr.setRequestHeader("Accept", "*/*");
          xhr.setRequestHeader("Postman-Token", "7cbd3d5f-603d-407c-8867-b80cf6bb25a3,a81fdfad-32d9-426a-86cb-7e800a95b2e3");
          xhr.setRequestHeader("Accept-Encoding", "gzip, deflate");
          xhr.setRequestHeader("Connection", "keep-alive");
          xhr.send(data);
          </script>
        </body>
    </html>
  `);
});
app.get('/cache', (req, res) => {
  res.set('Cache-Control', 'public, max-age=5');
  res.send(`
    A simple cache to check
  `);
});

app.post('/entry', (req, res) => {
  console.log(`Message received: ${req.body.message}`);
  res.send(`CSRF token used: ${req.body._csrf}, Message received: ${req.body.message}`);
});

app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
```