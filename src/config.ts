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

import * as path from 'path';

const pluginDirectory =
    path.join(path.resolve(__dirname, '..'), 'src', 'plugins');

export type CLSMechanism =
    'async-hooks'|'async-listener'|'auto'|'none'|'singular';

/** Available configuration options. */
export interface Config {
  /**
   * The trace context propagation mechanism to use. The following options are
   * available:
   * - 'async-hooks' uses an implementation of CLS on top of the Node core
   *   `async_hooks` module in Node 8+. This option should not be used if the
   *   Node binary version requirements are not met.
   * - 'async-listener' uses an implementation of CLS on top of the
   *   `continuation-local-storage` module.
   * - 'auto' behaves like 'async-hooks' on Node 8+ when the
   *   GCLOUD_TRACE_NEW_CONTEXT env variable is set, and 'async-listener'
   *   otherwise.
   * - 'none' disables CLS completely.
   * - 'singular' allows one root span to exist at a time. This option is meant
   *   to be used internally by Google Cloud Functions, or in any other
   *   environment where it is guaranteed that only one request is being served
   *   at a time.
   * The 'auto' mechanism is used by default if this configuration option is
   * not explicitly set.
   */
  clsMechanism?: CLSMechanism;

  /**
   * Log levels: 0=disabled, 1=error, 2=warn, 3=info, 4=debug
   * The value of GCLOUD_TRACE_LOGLEVEL takes precedence over this value.
   */
  logLevel?: number;

  /**
   * Whether to enable to Trace Agent or not.
   * Once enabled, the Trace Agent may not be disabled.
   */
  enabled?: boolean;

  /**
   * If true, additional information about query parameters and results will be
   * attached (as labels) to spans representing database operations.
   */
  enhancedDatabaseReporting?: boolean;

  /**
   * The maximum number of characters reported on a label value. This value
   * cannot exceed 16383, the maximum value accepted by the service.
   */
  maximumLabelValueSize?: number;

  /**
   * A list of trace plugins to load. Each field's key in this object is the
   * name of the module to trace, and its value is the require-friendly path
   * to the plugin. (See the default configuration below for examples.)
   * Any user-provided value will be used to extend its default value.
   * To disable a plugin in this list, you may override its path with a falsy
   * value. Disabling any of the default plugins may cause unwanted behavior,
   * so use caution.
   */
  plugins?: {[pluginName: string]: string;};

  /**
   * The max number of frames to include on traces; pass a value of 0 to
   * disable stack frame limits.
   */
  stackTraceLimit?: number;

  /**
   * Buffer the captured traces for `flushDelaySeconds` seconds before
   * publishing to the trace API, unless the buffer fills up first.
   * Also see `bufferSize`.
   */
  flushDelaySeconds?: number;

  /**
   * URLs that partially match any regex in ignoreUrls will not be traced.
   * In addition, URLs that are _exact matches_ of strings in ignoreUrls will
   * also not be traced (this is deprecated behavior and will be removed in v3).
   * URLs should be expected to be in the form of:
   *   /componentOne/componentTwo...
   * For example, having an ignoreUrls value of ['/'] will ignore all URLs,
   * while having an ignoreUrls value of ['^/$'] will ignore only '/' URLs.
   * Health checker probe URLs (/_ah/health) are ignored by default.
   */
  ignoreUrls?: Array<string|RegExp>;

  /**
   * An upper bound on the number of traces to gather each second. If set to 0,
   * sampling is disabled and all traces are recorded. Sampling rates greater
   * than 1000 are not supported and will result in at most 1000 samples per
   * second. Some Google Cloud environments may further limit this rate.
   */
  samplingRate?: number;

  /**
   * The number of transactions we buffer before we publish to the trace
   * API, unless `flushDelaySeconds` seconds have elapsed first.
   */
  bufferSize?: number;

  /**
   * Specifies the behavior of the trace agent in the case of an uncaught
   * exception. Possible values are:
   *   `ignore`: Take no action. The process may terminate before all the traces
   *            currently buffered have been flushed to the network.
   *   `flush`: Handle the uncaught exception and attempt to publish the traces
   *            to the API. Note that if you have other uncaught exception
   *            handlers in your application, they may choose to terminate the
   *            process before the buffer has been flushed to the network. Also,
   *            if you have no other terminating uncaught exception handlers in
   *            your application, the error will get swallowed and the
   *            application will keep on running. You should use this option if
   *            you have other uncaught exception handlers that you want to be
   *            responsible for terminating the application.
   *   `flushAndExit`: Handle the uncaught exception, make a best effort attempt
   *            to publish the traces to the API, and then terminate the
   *            application after a delay. Note that the presence of other
   *            uncaught exception handlers may choose to terminate the
   *            application before the buffer has been flushed to the network.
   */
  onUncaughtException?: string;

  /**
   * EXPERIMENTAL:
   * Allows to ignore the requests X-Cloud-Trace-Context header if set. Setting
   * this to true will cause traces generated by this module to appear
   * separately from other distributed work done by other services on behalf of
   * the same incoming request. Setting this will also cause sampling decisions
   * made by other distributed components to be ignored. This is useful for
   * aggregating traces generated by different cloud platform projects.
   */
  ignoreContextHeader?: boolean;

  /**
   * The ID of the Google Cloud Platform project with which traces should
   * be associated. The value of GCLOUD_PROJECT takes precedence over this
   * value; if neither are provided, the trace agent will attempt to retrieve
   * this information from the GCE metadata service.
   */
  projectId?: string;

  /**
   * The contents of a key file. If this field is set, its contents will be
   * used for authentication instead of your application default credentials.
   */
  credentials?: {client_email?: string; private_key?: string;};

  /**
   * A path to a key file relative to the current working directory. If this
   * field is set, the contents of the pointed file will be used for
   * authentication instead of your application default credentials.
   * If credentials is also set, the value of keyFilename will be ignored.
   */
  keyFilename?: string;

  /**
   * Specifies the service context with which traces from this application
   * will be associated. This may be useful in filtering traces originating
   * from a specific service within a project. These fields will automatically
   * be set through environment variables on Google App Engine.
   */
  serviceContext?: {service?: string; version?: string; minorVersion?: string;};
}

/**
 * Default configuration. For fields with primitive values, any user-provided
 * value will override the corresponding default value.
 * For fields with non-primitive values (plugins and serviceContext), the
 * user-provided value will be used to extend the default value.
 */
export const defaultConfig = {
  clsMechanism: 'auto' as CLSMechanism,
  logLevel: 1,
  enabled: true,
  enhancedDatabaseReporting: false,
  maximumLabelValueSize: 512,
  plugins: {
    // enable all by default
    'connect': path.join(pluginDirectory, 'plugin-connect.js'),
    'express': path.join(pluginDirectory, 'plugin-express.js'),
    'generic-pool': path.join(pluginDirectory, 'plugin-generic-pool.js'),
    'grpc': path.join(pluginDirectory, 'plugin-grpc.js'),
    'hapi': path.join(pluginDirectory, 'plugin-hapi.js'),
    'http': path.join(pluginDirectory, 'plugin-http.js'),
    'http2': path.join(pluginDirectory, 'plugin-http2.js'),
    'knex': path.join(pluginDirectory, 'plugin-knex.js'),
    'koa': path.join(pluginDirectory, 'plugin-koa.js'),
    'mongodb-core': path.join(pluginDirectory, 'plugin-mongodb-core.js'),
    'mysql': path.join(pluginDirectory, 'plugin-mysql.js'),
    'mysql2': path.join(pluginDirectory, 'plugin-mysql2.js'),
    'pg': path.join(pluginDirectory, 'plugin-pg.js'),
    'redis': path.join(pluginDirectory, 'plugin-redis.js'),
    'restify': path.join(pluginDirectory, 'plugin-restify.js')
  },
  stackTraceLimit: 10,
  flushDelaySeconds: 30,
  ignoreUrls: ['/_ah/health'],
  samplingRate: 10,
  bufferSize: 1000,
  onUncaughtException: 'ignore',
  ignoreContextHeader: false,
  serviceContext: {}
};
