/**
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';
var shimmer = require('shimmer');
var url = require('url');
var isString = require('is').string;
var httpAgent = require('_http_agent');
var semver = require('semver');

function getSpanName(options) {
  // c.f. _http_client.js ClientRequest constructor
  return options.hostname || options.host || 'localhost';
}

function extractUrl(options) {
  var uri = options;
  var agent = options._defaultAgent || httpAgent.globalAgent;
  // In theory we should use url.format here. However, that is
  // broken. See: https://github.com/joyent/node/issues/9117 and
  // https://github.com/nodejs/io.js/pull/893
  // Let's do things the same way _http_client does it.
  return isString(uri) ? uri :
    (options.protocol || agent.protocol) + '//' +
    (options.hostname || options.host || 'localhost') +
    (options.port ? (':' + options.port) : '') +
    (options.path || options.pathName || '/');
}

function isTraceAgentRequest (options, api) {
  return options && options.headers &&
    !!options.headers[api.constants.TRACE_AGENT_REQUEST_HEADER];
}

function makeRequestTrace(request, api) {
  // On Node 8+ we use the following function to patch both request and get.
  // Here `request` may also happen to be `get`.
  return function request_trace(options, callback) {
    if (!options) {
      return request(options, callback);
    }

    // Don't trace ourselves lest we get into infinite loops
    // Note: this would not be a problem if we guarantee buffering
    // of trace api calls. If there is no buffering then each trace is
    // an http call which will get a trace which will be an http call
    if (isTraceAgentRequest(options, api)) {
      return request(options, callback);
    }

    var uri;
    if (isString(options)) {
      // save the value of uri so we don't have to reconstruct it later
      uri = extractUrl(options);
      options = url.parse(options);
    }

    var requestLifecycleSpan =
        api.createChildSpan({name: getSpanName(options)});
    if (!requestLifecycleSpan) {
      return request(options, callback);
    }

    if (!uri) {
      uri = extractUrl(options);
    }

    requestLifecycleSpan.addLabel(api.labels.HTTP_METHOD_LABEL_KEY,
                                  options.method);
    requestLifecycleSpan.addLabel(api.labels.HTTP_URL_LABEL_KEY, uri);

    var req = request.call(this, options, function(res) {
      api.wrapEmitter(res);
      var numBytes = 0;
      var listenerAttached = false;
      // Responses returned by http#request are yielded in paused mode. Attaching
      // a 'data' listener to the request will switch the stream to flowing mode
      // which could cause the request to drain before the calling framework has
      // a chance to attach their own listeners. To avoid this, we attach our listener
      // lazily.
      // This approach to tracking data size will not observe data read by
      // explicitly calling `read` on the request. We expect this to be very
      // uncommon as it is not mentioned in any of the official documentation.
      shimmer.wrap(res, 'on', function onWrap(on) {
        return function on_trace(eventName, cb) {
          if (eventName === 'data' && !listenerAttached) {
            listenerAttached = true;
            on.call(this, 'data', function(chunk) {
              numBytes += chunk.length;
            });
          }
          return on.apply(this, arguments);
        };
      });
      res.on('end', function () {
        requestLifecycleSpan
          .addLabel(api.labels.HTTP_RESPONSE_SIZE_LABEL_KEY, numBytes);
        requestLifecycleSpan
          .addLabel(api.labels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
        requestLifecycleSpan.endSpan();
      });
      if (callback) {
        return callback(res);
      }
    });
    req.setHeader(api.constants.TRACE_CONTEXT_HEADER_NAME,
        requestLifecycleSpan.getTraceContext());
    api.wrapEmitter(req);
    req.on('error', function (e) {
      if (e) {
        requestLifecycleSpan.addLabel(api.labels.ERROR_DETAILS_NAME, e.name);
        requestLifecycleSpan
          .addLabel(api.labels.ERROR_DETAILS_MESSAGE, e.message);
      } else {
        // What's the new logger target?
        // console.error('HTTP request error was null or undefined', e);
      }
      requestLifecycleSpan.endSpan();
    });
    return req;
  };
}

function patchHttp(http, api) {
  shimmer.wrap(http, 'request', function requestWrap(request) {
    return makeRequestTrace(request, api);
  });

  if (semver.satisfies(process.version, '>=8.0.0')) {
    // http.get in Node 8 calls the private copy of request rather than the one
    // we have patched on module.export, so patch get as well.
    shimmer.wrap(http, 'get', function getWrap() {
      // Re-implement http.get. This needs to be done (instead of using
      // makeRequestTrace to patch it) because we need to set the trace
      // context header before the returned ClientRequest is ended.
      // The Node.js docs state that the only differences between request and
      // get are that (1) get defaults to the HTTP GET method and (2) the
      // returned request object is ended immediately.
      // The former is already true (at least in supported Node versions up to
      // v9), so we simply follow the latter.
      // Ref: https://nodejs.org/dist/latest/docs/api/http.html#http_http_get_options_callback
      return function getTrace(options, callback) {
        var req = http.request(options, callback);
        req.end();
        return req;
      };
    });
  }
}

// https.get depends on https.request in <8.9 and >=8.9.1
function patchHttps(https, api) {
  shimmer.wrap(https, 'request', function requestWrap(request) {
    return makeRequestTrace(request, api);
  });
  shimmer.wrap(https, 'get', function getWrap() {
    return function getTrace(options, callback) {
      var req = https.request(options, callback);
      req.end();
      return req;
    };
  });
}

function unpatchHttp(http) {
  shimmer.unwrap(http, 'request');
  if (semver.satisfies(process.version, '>=8.0.0')) {
    shimmer.unwrap(http, 'get');
  }
}

function unpatchHttps(https) {
  shimmer.unwrap(https, 'request');
  shimmer.unwrap(https, 'get');
}

module.exports = [
  {
    file: 'http',
    patch: patchHttp,
    unpatch: unpatchHttp
  },
  {
    file: 'https',
    versions: '=8.9.0 || >=9.0.0',
    patch: patchHttps,
    unpatch: unpatchHttps
  }
];

export default {};
