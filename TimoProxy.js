const http = require('http');
const url_parser = require('url');

module.exports = function ({ request, response, configs }) {
     const proxy_methods = {
          client_cookies: request.headers.cookie || '',
          need_body: ['POST', 'PUT', 'DELETE'],
          without_body: ['GET', 'HEAD'],
          request_method: request.method,
          cookie_to_send: [],
          validate() {
               if (!request || !response) return 'NO_REQ_RES';
               else if (typeof configs.allowCookie !== 'object') return 'COOKIE_CONF_ERR';
               else if (typeof configs.callbacks !== 'function' && !(configs.callbacks instanceof Array))
                    return 'CALLBACK_FORMAT_ERR';
               else if (typeof configs.url !== 'string') return 'TARGET_FORMAT_ERR';
               else return 'OK';
          },
          needleCookies(regex = true) {
               const c_name_set = Object.keys(configs.allowCookie).join('|');

               return regex ? new RegExp(`^\s*(${c_name_set})\s*$`, 'i') : c_name_set;
          },
          handleCookies() {
               const incoming_cookie = this.client_cookies.split(';');
               const cookie_filter = this.needleCookies();

               for (const cookie of incoming_cookie) {
                    const [c_name, c_value] = cookie.split('=');

                    if (cookie_filter.test(c_name))
                         this.cookie_to_send.push(
                              `${c_name}=${c_value}; Max-Age=${configs.allowCookie[c_name]}; Domain=${configs.domain}; HttpOnly`
                         );
               }
          },
          makeOptions() {
               const method = this.request_method;
               const cookies = this.cookie_to_send;

               const url = url_parser.parse(configs.url);

               const [host, port] = url.host.split(':');

               this.handleCookies();

               const options = {
                    hostname: host,
                    port: port || 80,
                    path: url.pathname,
                    method,
                    headers: {
                         'Host': request.headers['host'],
                         'User-Agent': request.headers['user-agent'],
                         'Connection': 'keep-alive',
                         'Cache-Control': 'max-age',
                         'Cookie': cookies,
                    }
               }

               if (this.need_body.includes(this.request_method))
                    options.headers['Content-Type'] = 'application/x-www-form-urlencoded';

               return options;
          },
          makeRequest(options, query) {
               const requestObject = http.request(options, (res) => {
                    let response_body = '';

                    res.on('data', (chunk) => {
                         response_body += chunk;
                    });

                    res.on('end', () => {
                         response.setStatus = 200;
                         response.statusMessage = 'OK';

                         for (const header in res.headers)
                              response.setHeader(header, res.headers[header]);

                         response.end(response_body);

                         if (configs.callbacks instanceof Array) {
                              configs.callbacks.forEach(c => {
                                   if (typeof c === 'function') c();
                              });
                         } else {
                              configs.callbacks();
                         }
                    });
               });

               if (this.need_body.includes(this.request_method))
                    requestObject.write(query);

               requestObject.end();
          },
          proxify() {
               new Promise((resolve, reject) => {
                    if (this.need_body.includes(this.request_method)) {
                         let body = '';

                         request.on('data', (data) => {
                              body += data;

                              if (body.length > 1e6)
                                   request.connection.destroy();
                         });

                         request.on('end', (data) => {
                              resolve(body);
                         });

                    } else if (this.without_body.includes(this.request_method)) {
                         resolve(url_parser.parse(request.url, true));
                    } else {
                         reject("INVALID_REQUEST");
                    }
               }).then(info => {
                    const options = this.makeOptions();

                    this.makeRequest(options, info);
               }).catch(error => {
                    response.setStatus = 500;

                    response.end(error);
               });
          }
     } 

     const validated = proxy_methods.validate();

     if (validated === 'OK') {
          proxy_methods.proxify();
     } else {
          response.setStatus = 422;

          response.end(validated);
     }
}
