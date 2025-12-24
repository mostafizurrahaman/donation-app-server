import type * as types from './types';
import type { ConfigOptions, FetchResponse } from 'api/dist/core'
import Oas from 'oas';
import APICore from 'api/dist/core';
import definition from './openapi.json';

class SDK {
  spec: Oas;
  core: APICore;

  constructor() {
    this.spec = Oas.init(definition);
    this.core = new APICore(this.spec, 'basiq/3.0.0 (api/6.1.3)');
  }

  /**
   * Optionally configure various options that the SDK allows.
   *
   * @param config Object of supported SDK options and toggles.
   * @param config.timeout Override the default `fetch` request timeout of 30 seconds. This number
   * should be represented in milliseconds.
   */
  config(config: ConfigOptions) {
    this.core.setConfig(config);
  }

  /**
   * If the API you're using requires authentication you can supply the required credentials
   * through this method and the library will magically determine how they should be used
   * within your API request.
   *
   * With the exception of OpenID and MutualTLS, it supports all forms of authentication
   * supported by the OpenAPI specification.
   *
   * @example <caption>HTTP Basic auth</caption>
   * sdk.auth('username', 'password');
   *
   * @example <caption>Bearer tokens (HTTP or OAuth 2)</caption>
   * sdk.auth('myBearerToken');
   *
   * @example <caption>API Keys</caption>
   * sdk.auth('myApiKey');
   *
   * @see {@link https://spec.openapis.org/oas/v3.0.3#fixed-fields-22}
   * @see {@link https://spec.openapis.org/oas/v3.1.0#fixed-fields-22}
   * @param values Your auth credentials for the API; can specify up to two strings or numbers.
   */
  auth(...values: string[] | number[]) {
    this.core.setAuth(...values);
    return this;
  }

  /**
   * If the API you're using offers alternate server URLs, and server variables, you can tell
   * the SDK which one to use with this method. To use it you can supply either one of the
   * server URLs that are contained within the OpenAPI definition (along with any server
   * variables), or you can pass it a fully qualified URL to use (that may or may not exist
   * within the OpenAPI definition).
   *
   * @example <caption>Server URL with server variables</caption>
   * sdk.server('https://{region}.api.example.com/{basePath}', {
   *   name: 'eu',
   *   basePath: 'v14',
   * });
   *
   * @example <caption>Fully qualified server URL</caption>
   * sdk.server('https://eu.api.example.com/v14');
   *
   * @param url Server URL
   * @param variables An object of variables to replace into the server URL.
   */
  server(url: string, variables = {}) {
    this.core.setServer(url, variables);
  }

  /**
   * Use this endpoint to retrieve a token that will be passed as authorization header for
   * Basiq API
   *
   * @summary Generate an auth token
   * @throws FetchError<400, types.BadRequestError> Returns error that server cannot or will not process the request as it does not
   * conform.
   * @throws FetchError<404, types.NotFoundError> Returns error indicating that server can't find requested resource.
   * @throws FetchError<500, types.InternalServerError> Returns error response code indicates that the server encountered an unexpected
   * condition that prevented it from fulfilling the request.
   */
  postToken(body: types.PostTokenFormDataParam, metadata: types.PostTokenMetadataParam): Promise<FetchResponse<200, types.TokenPostResponse>>;
  postToken(metadata: types.PostTokenMetadataParam): Promise<FetchResponse<200, types.TokenPostResponse>>;
  postToken(body?: types.PostTokenFormDataParam | types.PostTokenMetadataParam, metadata?: types.PostTokenMetadataParam): Promise<FetchResponse<200, types.TokenPostResponse>> {
    return this.core.fetch('/token', 'post', body, metadata);
  }

  /**
   * Creates a new Basiq user object
   *
   * @summary Create a user
   * @throws FetchError<400, types.BadRequestError> Returns error that server cannot or will not process the request due to something that
   * is perceived to be a client error.
   * @throws FetchError<401, types.UnauthorizedError> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<403, types.ForbiddenAccessError> Error that access is forbidden and tied to the application logic, such as insufficient
   * rights to a resource.
   * @throws FetchError<404, types.NotFoundError> Returns error indicating that server can't find requested resource.
   * @throws FetchError<500, types.InternalServerError> Returns error response code indicates that the server encountered an unexpected
   * condition that prevented it from fulfilling the request.
   */
  createUser(body: types.CreateUser): Promise<FetchResponse<201, types.UserPostResponse>> {
    return this.core.fetch('/users', 'post', body);
  }

  /**
   * Retrieves the details of an existing user. You need only supply the unique user
   * identifier that was returned upon user creation.
   *
   * @summary Retrieve a user
   * @throws FetchError<400, types.BadRequestError> Returns error that server cannot or will not process the request due to something that
   * is perceived to be a client error.
   * @throws FetchError<401, types.UnauthorizedError> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<403, types.ForbiddenAccessError> Error that access is forbidden and tied to the application logic, such as insufficient
   * rights to a resource.
   * @throws FetchError<404, types.NotFoundError> Returns error indicating that server can't find requested resource.
   * @throws FetchError<500, types.InternalServerError> Returns error response code indicates that the server encountered an unexpected
   * condition that prevented it from fulfilling the request.
   */
  getUser(metadata: types.GetUserMetadataParam): Promise<FetchResponse<200, types.UserGetResponse>> {
    return this.core.fetch('/users/{userId}', 'get', metadata);
  }

  /**
   * Updates the specified user by setting the values of the parameters passed. Any
   * parameters not provided will be left unchanged.
   *
   * @summary Update a user
   * @throws FetchError<400, types.BadRequestError> Returns error that server cannot or will not process the request due to something that
   * is perceived to be a client error.
   * @throws FetchError<401, types.UnauthorizedError> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<403, types.ForbiddenAccessError> Error that access is forbidden and tied to the application logic, such as insufficient
   * rights to a resource.
   * @throws FetchError<404, types.NotFoundError> Returns error indicating that server can't find requested resource.
   * @throws FetchError<500, types.InternalServerError> Returns error response code indicates that the server encountered an unexpected
   * condition that prevented it from fulfilling the request.
   */
  updateUser(body: types.UpdateUser, metadata: types.UpdateUserMetadataParam): Promise<FetchResponse<200, types.UserPostResponse>> {
    return this.core.fetch('/users/{userId}', 'post', body, metadata);
  }

  /**
   * Permanently deletes a user along with all of their associated connection details. All
   * data associated with this user will deleted. You need only supply the unique user
   * identifier that was returned upon user creation.
   *
   * @summary Delete a user
   * @throws FetchError<400, types.BadRequestError> Returns error that server cannot or will not process the request due to something that
   * is perceived to be a client error.
   * @throws FetchError<401, types.UnauthorizedError> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<403, types.ForbiddenAccessError> Error that access is forbidden and tied to the application logic, such as insufficient
   * rights to a resource.
   * @throws FetchError<404, types.NotFoundError> Returns error indicating that server can't find requested resource.
   * @throws FetchError<500, types.InternalServerError> Returns error response code indicates that the server encountered an unexpected
   * condition that prevented it from fulfilling the request.
   * @throws FetchError<503, types.StatusServiceUnavailableError> Returns error response code indicates that the server is not ready to handle the
   * request.
   */
  deleteUser(metadata: types.DeleteUserMetadataParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/users/{userId}', 'delete', metadata);
  }

  /**
   * Retrieves a list of the user consents
   *
   * @summary Retrieve consents
   * @throws FetchError<400, types.BadRequestError> Returns error that server cannot or will not process the request due to something that
   * is perceived to be a client error.
   * @throws FetchError<401, types.UnauthorizedError> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<403, types.ForbiddenAccessError> Error that access is forbidden and tied to the application logic, such as insufficient
   * rights to a resource.
   * @throws FetchError<404, types.NotFoundError> Returns error indicating that server can't find requested resource.
   * @throws FetchError<500, types.InternalServerError> Returns error response code indicates that the server encountered an unexpected
   * condition that prevented it from fulfilling the request.
   */
  getConsents(metadata: types.GetConsentsMetadataParam): Promise<FetchResponse<200, types.GetConsentsResponse200>> {
    return this.core.fetch('/users/{userId}/consents', 'get', metadata);
  }

  /**
   * Permanently deletes a users consent, this action cannot be undone.
   *
   * @summary Delete a consent
   * @throws FetchError<400, types.BadRequestError> Returns error that server cannot or will not process the request due to something that
   * is perceived to be a client error.
   * @throws FetchError<401, types.UnauthorizedError> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<403, types.ForbiddenAccessError> Error that access is forbidden and tied to the application logic, such as insufficient
   * rights to a resource.
   * @throws FetchError<404, types.NotFoundError> Returns error indicating that server can't find requested resource.
   * @throws FetchError<500, types.InternalServerError> Returns error response code indicates that the server encountered an unexpected
   * condition that prevented it from fulfilling the request.
   * @throws FetchError<503, types.StatusServiceUnavailableError> Returns error response code indicates that the server is not ready to handle the
   * request.
   */
  deleteConsent(metadata: types.DeleteConsentMetadataParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/users/{userId}/consents/{consentId}', 'delete', metadata);
  }

  /**
   * Create a new auth_link object by making a POST request to the auth_link endpoint. The
   * new auth_link will effectively delete previous auth_link for that user, rendering the
   * previous URL(s) invalid.
   *
   * The 'mobile' attribute is used for 2FA SMS verification and is conditionally required.
   * If it is not specified, we will look up the mobile on the user object; if that is not
   * specified either, you will get an error.  If both are specified, the mobile number on
   * the auth_link will take precedence.
   *
   * @summary Create an auth_link
   * @throws FetchError<400, types.BadRequestError> Returns error that server cannot or will not process the request due to something that
   * is perceived to be a client error
   * @throws FetchError<401, types.UnauthorizedError> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<403, types.ForbiddenAccessError> Error that access is forbidden and tied to the application logic, such as insufficient
   * rights to a resource.
   * @throws FetchError<404, types.NotFoundError> Returns error indicating that server can't find requested resource.
   * @throws FetchError<500, types.InternalServerError> Returns error response code indicates that the server encountered an unexpected
   * condition that prevented it from fulfilling the request.
   */
  postAuthLink(body: types.PostAuthLinkBodyParam, metadata: types.PostAuthLinkMetadataParam): Promise<FetchResponse<201, types.AuthLinksPostResponseResource>>;
  postAuthLink(metadata: types.PostAuthLinkMetadataParam): Promise<FetchResponse<201, types.AuthLinksPostResponseResource>>;
  postAuthLink(body?: types.PostAuthLinkBodyParam | types.PostAuthLinkMetadataParam, metadata?: types.PostAuthLinkMetadataParam): Promise<FetchResponse<201, types.AuthLinksPostResponseResource>> {
    return this.core.fetch('/users/{userId}/auth_link', 'post', body, metadata);
  }

  /**
   * Returns the latest/last auth_link generated for the specified user. Returns an error
   * otherwise.
   *
   * @summary Retrieve an auth_link
   * @throws FetchError<400, types.BadRequestError> Returns error that server cannot or will not process the request due to something that
   * is perceived to be a client error
   * @throws FetchError<401, types.UnauthorizedError> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<403, types.ForbiddenAccessError> Error that access is forbidden and tied to the application logic, such as insufficient
   * rights to a resource.
   * @throws FetchError<404, types.NotFoundError> Returns error indicating that server can't find requested resource.
   * @throws FetchError<410, types.GoneError> Returns error indicating that access to the target resource is no longer available at
   * the origin server and that this condition is likely to be permanent.
   * @throws FetchError<500, types.InternalServerError> Returns error response code indicates that the server encountered an unexpected
   * condition that prevented it from fulfilling the request.
   * @throws FetchError<503, types.StatusServiceUnavailableError> Returns error response code indicates that the server is not ready to handle the
   * request.
   */
  getAuthLink(metadata: types.GetAuthLinkMetadataParam): Promise<FetchResponse<200, types.AuthLinksResponseResource>> {
    return this.core.fetch('/users/{userId}/auth_link', 'get', metadata);
  }

  /**
   * <blockquote>Note that this action cannot be undone.</blockquote>
   *
   * <blockquote>The auth_link is a URL that directs a User to Basiq's hosted consent
   * workflow to link banks and securely share data. When the user selects 'I have disclosed
   * all my accounts' the auth_link is automatically deleted.</blockquote>
   *
   * Returns an empty body if the delete succeeded. Otherwise, this call returns an error in
   * the event of a failure.
   *
   * @summary Delete an auth_link
   * @throws FetchError<400, types.BadRequestError> Returns error that server cannot or will not process the request due to something that
   * is perceived to be a client error
   * @throws FetchError<401, types.UnauthorizedError> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<404, types.NotFoundError> Returns error indicating that server can't find requested resource.
   * @throws FetchError<500, types.InternalServerError> Returns error response code indicates that the server encountered an unexpected
   * condition that prevented it from fulfilling the request.
   * @throws FetchError<503, types.StatusServiceUnavailableError> Returns error response code indicates that the server is not ready to handle the
   * request.
   */
  deleteAuthLink(metadata: types.DeleteAuthLinkMetadataParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/users/{userId}/auth_link', 'delete', metadata);
  }

  /**
   * Returns a list of all events that have taken place.
   *
   * @summary List all events
   * @throws FetchError<400, types.BadRequestError> Returns error that server cannot or will not process the request due to something that
   * is perceived to be a client error.
   * @throws FetchError<401, types.UnauthorizedError> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<403, types.ForbiddenAccessError> Error that access is forbidden and tied to the application logic, such as insufficient
   * rights to a resource.
   * @throws FetchError<404, types.NotFoundError> Returns error indicating that server can't find requested resource.
   * @throws FetchError<500, types.InternalServerError> Returns error response code indicates that the server encountered an unexpected
   * condition that prevented it from fulfilling the request.
   * @throws FetchError<503, types.StatusServiceUnavailableError> Returns error response code indicates that the server is not ready to handle the
   * request.
   */
  getEvents(metadata?: types.GetEventsMetadataParam): Promise<FetchResponse<200, types.EventsGetResponseResource>> {
    return this.core.fetch('/events', 'get', metadata);
  }

  /**
   * Returns a single event type based on the parameter input.
   *
   * @summary Retrieve an event
   * @throws FetchError<400, types.Error> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<401, types.Error> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<403, types.ForbiddenAccessError> Error that access is forbidden and tied to the application logic, such as insufficient
   * rights to a resource.
   * @throws FetchError<404, types.Error> Not Found
   * @throws FetchError<429, types.Error> Too many requests
   * @throws FetchError<500, types.InternalServerError> Returns error response code indicates that the server encountered an unexpected
   * condition that prevented it from fulfilling the request.
   * @throws FetchError<503, types.StatusServiceUnavailableError> Returns error response code indicates that the server is not ready to handle the
   * request.
   */
  getTypeById(metadata: types.GetTypeByIdMetadataParam): Promise<FetchResponse<200, types.RetrieveEvent>> {
    return this.core.fetch('/events/{id}', 'get', metadata);
  }

  /**
   * Returns a list of event types.
   *
   * @summary List event types
   * @throws FetchError<401, types.Error> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<403, types.ForbiddenAccessError> Error that access is forbidden and tied to the application logic, such as insufficient
   * rights to a resource.
   * @throws FetchError<429, types.Error> Too many requests
   * @throws FetchError<500, types.InternalServerError> Returns error response code indicates that the server encountered an unexpected
   * condition that prevented it from fulfilling the request.
   * @throws FetchError<503, types.StatusServiceUnavailableError> Returns error response code indicates that the server is not ready to handle the
   * request.
   */
  listEventTypes(): Promise<FetchResponse<200, types.EventTypes>> {
    return this.core.fetch('/events/types', 'get');
  }

  /**
   * Returns a single event type based on the parameter input.
   *
   * @summary Retrieve an event type
   * @throws FetchError<400, types.Error> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<401, types.Error> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<403, types.ForbiddenAccessError> Error that access is forbidden and tied to the application logic, such as insufficient
   * rights to a resource.
   * @throws FetchError<404, types.Error> Not Found
   * @throws FetchError<429, types.Error> Too many requests
   * @throws FetchError<500, types.InternalServerError> Returns error response code indicates that the server encountered an unexpected
   * condition that prevented it from fulfilling the request.
   * @throws FetchError<503, types.StatusServiceUnavailableError> Returns error response code indicates that the server is not ready to handle the
   * request.
   */
  getEventTypeById(metadata: types.GetEventTypeByIdMetadataParam): Promise<FetchResponse<200, types.EventType>> {
    return this.core.fetch('/events/types/{id}', 'get', metadata);
  }

  /**
   * Retrieves the details of all existing and previous jobs associated with a user.
   *
   * **Note:** This endpoint only returns jobs that are less than 7 days old.
   *
   * @summary Get user jobs
   * @throws FetchError<400, types.BadRequestError> Returns error that server cannot or will not process the request due to something that
   * is perceived to be a client error
   * @throws FetchError<401, types.UnauthorizedError> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<403, types.ForbiddenAccessError> Error that access is forbidden and tied to the application logic, such as insufficient
   * rights to a resource.
   * @throws FetchError<404, types.NotFoundError> Returns error indicating that server can't find requested resource.
   * @throws FetchError<500, types.InternalServerError> Returns error response code indicates that the server encountered an unexpected
   * condition that prevented it from fulfilling the request.
   */
  getUserJobs(metadata: types.GetUserJobsMetadataParam): Promise<FetchResponse<200, types.JobsResponseResource>> {
    return this.core.fetch('/users/{userId}/jobs', 'get', metadata);
  }

  /**
   * Retrieves the details of an existing job. You need only supply the unique job identifier
   * that was returned upon job creation.
   *
   * @summary Retrieve a job
   * @throws FetchError<400, types.BadRequestError> Returns error that server cannot or will not process the request due to something that
   * is perceived to be a client error
   * @throws FetchError<401, types.UnauthorizedError> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<403, types.ForbiddenAccessError> Error that access is forbidden and tied to the application logic, such as insufficient
   * rights to a resource.
   * @throws FetchError<404, types.NotFoundError> Returns error indicating that server can't find requested resource.
   * @throws FetchError<500, types.InternalServerError> Returns error response code indicates that the server encountered an unexpected
   * condition that prevented it from fulfilling the request.
   */
  getJobs(metadata: types.GetJobsMetadataParam): Promise<FetchResponse<200, types.GetJobsResponse200>> {
    return this.core.fetch('/jobs/{jobId}', 'get', metadata);
  }

  /**
   * Ensure that you generate an authentication token with
   * scope = CLIENT_ACCESS and basiq-version = 3.0 to create this resource
   *
   * @summary Create MFA response
   * @throws FetchError<400, types.BadRequestError> Returns error that server cannot or will not process the request due to something that
   * is perceived to be a client error
   * @throws FetchError<401, types.UnauthorizedError> Error status response code indicates that the request has not been applied because it
   * lacks valid authentication credentials for the target resource.
   * @throws FetchError<403, types.ForbiddenAccessError> Error that access is forbidden and tied to the application logic, such as insufficient
   * rights to a resource.
   * @throws FetchError<404, types.NotFoundError> Returns error indicating that server can't find requested resource.
   * @throws FetchError<500, types.InternalServerError> Returns error response code indicates that the server encountered an unexpected
   * condition that prevented it from fulfilling the request.
   */
  postJobMfa(body: types.JobPostRequest, metadata: types.PostJobMfaMetadataParam): Promise<FetchResponse<202, types.ConnectionResponseResource>> {
    return this.core.fetch('/jobs/{jobId}/mfa', 'post', body, metadata);
  }
}

const createSDK = (() => { return new SDK(); })()
;

export default createSDK;

export type { AuthLinkLinks, AuthLinksPostResponseResource, AuthLinksResponseResource, BadRequestError, ConnectionResponseResource, CreateUser, Data, DeleteAuthLinkMetadataParam, DeleteConsentMetadataParam, DeleteUserMetadataParam, Error, EventType, EventTypes, EventsData, EventsGetResponseResource, ForbiddenAccessError, GetAuthLinkMetadataParam, GetConsentsMetadataParam, GetConsentsResponse200, GetEventTypeByIdMetadataParam, GetEventsMetadataParam, GetJobsMetadataParam, GetJobsResponse200, GetTypeByIdMetadataParam, GetUserAccount, GetUserAccountData, GetUserConnection, GetUserConnectionData, GetUserJobsMetadataParam, GetUserLinks, GetUserMetadataParam, GoneError, Information, InternalServerError, Job, JobPostRequest, JobsData, JobsInstitution, JobsLinks, JobsResponseResource, JobsResult, JobsStep, NotFoundError, Permission, PostAuthLinkBodyParam, PostAuthLinkMetadataParam, PostJobMfaMetadataParam, PostTokenFormDataParam, PostTokenMetadataParam, Primary, Purpose, ReportsJob, ResourceLink, RetrieveEvent, Source, StatementJobs, StatusServiceUnavailableError, TokenPostResponse, UnauthorizedError, UpdateUser, UpdateUserMetadataParam, UserConsentGetResponses, UserGetResponse, UserPostResponse } from './types';
