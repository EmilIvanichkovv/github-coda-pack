import * as coda from "@codahq/packs-sdk";
import * as schemas from "./schemas";
import * as types from "./types";
import * as helpers from "./helpers";

export const pack = coda.newPack();
export const HOST = "github.com";
export const API_ENDPOINT = `https://${HOST}/api/v4`;

// Allow the Pack to access the GitHub domain.
pack.addNetworkDomain(HOST);
// pack.addNetworkDomain("api.github.com");

// The GitHub pack uses OAuth authentication, to allow each user to login
// to GitHub via the browser when installing the pack. The pack will
// operate on their personal data.
pack.setUserAuthentication({
  type: coda.AuthenticationType.OAuth2,
  // As outlined in https://docs.github.com/en/free-pro-team@latest/developers/apps/authorizing-oauth-apps,
  // these are the urls for initiating OAuth authentication and doing
  // token exchange.
  authorizationUrl: "https://github.com/login/oauth/authorize",
  tokenUrl: "https://github.com/login/oauth/access_token",
  // When making authorized http requests, most services ask you to pass
  // a header of this form:
  // `Authorization: Bearer <OAUTH-TOKEN>`
  // but GitHub asks you use:
  // `Authorization: token <OAUTH-TOKEN>`
  // so we specify a non-default tokenPrefix here.
  tokenPrefix: "token",
  // These are the GitHub-specific scopes the user will be prompted to
  // authorize in order for the functionality in this pack to succeed.
  scopes: ["read:user", "repo"],
  // This is a simple formula that makes an API call to GitHub to find
  // the name of the user associated with the OAuth access token. This
  // name is used to label the Coda account connection associated with
  // these credentials throughout the Coda UI. For example, a user may
  // connect both a personal GitHub account and a work GitHub account to
  // Coda, and this formula will help those accounts be clearly labeled
  // in Coda without direct input from the user.
  getConnectionName: helpers.getConnectionName,
});

// A parameter that identifies a repo to sync data from using the repo's url.
// For each sync configuration, the user must select a single repo from which
// to sync, since GitHub's API does not return entities across repos
// However, a user can set up multiple sync configurations
// and each one can individually sync from a separate repo.
// (This is exported so that we can unittest the autocomplete formula.)
export const RepoUrlParameter = coda.makeParameter({
  type: coda.ParameterType.String,
  name: "repoUrl",
  description:
    'The URL of the repository to list pull requests from. For example, "https://github.com/[org]/[repo]".',
  // This autocomplete formula will list all of the repos that the current
  // user has access to and expose them as a searchable dropdown in the UI.
  // It fetches the GitHub repo objects and then runs a simple text search
  // over the repo name.
  autocomplete: async (context, search) => {
    let results: types.GitHubRepo[] = [];
    let continuation: coda.Continuation | undefined;
    do {
      let response = await helpers.getRepos(context, continuation);
      results = results.concat(...response.result);
      ({ continuation } = response);
    } while (continuation && continuation.nextUrl);
    // This helper function can implement most autocomplete use cases. It
    // takes the user's current search (if any) and an array of arbitrary
    // objects. The final arguments are the property name of a label field to
    // search over, and finally the property name that should be used as the
    // value when a user selects a result.
    // So here, this is saying "search the `name` field of reach result, and
    // use the html_url as the value once selected".
    return coda.autocompleteSearchObjects(search, results, "name", "html_url");
  },
});

const BaseParameterOptional = coda.makeParameter({
  type: coda.ParameterType.String,
  name: "base",
  description: 'The name of the base branch. For example, "main".',
  optional: true,
});

const PullRequestStateOptional = coda.makeParameter({
  type: coda.ParameterType.String,
  name: "state",
  description:
    'Returns pull requests in the given state. If unspecified, defaults to "open".',
  optional: true,
  autocomplete: [
    {
      display: "Open pull requests only",
      value: types.PullRequestStateFilter.Open,
    },
    {
      display: "Closed pull requests only",
      value: types.PullRequestStateFilter.Closed,
    },
    { display: "All pull requests", value: types.PullRequestStateFilter.All },
  ],
});

const IssueStateOptional = coda.makeParameter({
  type: coda.ParameterType.String,
  name: "state",
  description:
    'Returns issues in the given state. If unspecified, defaults to "open".',
  optional: true,
  autocomplete: [
    { display: "Open issues only", value: "open" },
    { display: "Closed issues only", value: "closed" },
    { display: "All issues", value: "all" },
  ],
});

const IssueNumberParameter = coda.makeParameter({
  type: coda.ParameterType.Number,
  name: "issueNumber",
  description: "The number of the issue.",
});

const IssueTitleParameter = coda.makeParameter({
  type: coda.ParameterType.String,
  name: "title",
  description: "The title of the issue.",
  optional: true,
});

const IssueBodyParameter = coda.makeParameter({
  type: coda.ParameterType.String,
  name: "body",
  description: "The body content of the issue.",
  optional: true,
});

const IssueStateParameter = coda.makeParameter({
  type: coda.ParameterType.String,
  name: "state",
  description: 'The state of the issue. Can be "open" or "closed".',
  optional: true,
  autocomplete: [
    { display: "Open", value: "open" },
    { display: "Closed", value: "closed" },
  ],
});

pack.addSyncTable({
  // This is the name of the sync table, which will show in the UI.
  name: "PullRequests",
  // This the unique id of the table, used internally. By convention, it's
  // often the singular form the display name defined right above.
  // Other sync tables and formulas can return references to rows in this
  // table, by defining an `Identity` object in their response schemas that
  // points to this value, e.g. `identity: {name: 'PullRequest'}`.
  identityName: "PullRequest",
  // This is the schema of a single entity (row) being synced. The formula
  // that implements this sync must return an array of objects matching this
  // schema. Each such object will be a row in the resulting table.
  schema: schemas.PullRequestSchema,
  formula: {
    // This is the name of the formula that implements the sync. By convention
    // it should be the same as the name of the sync table. This will be
    // removed in a future version of the SDK.
    name: "PullRequests",
    // A description to show in the UI.
    description: "Sync pull requests from GitHub.",
    parameters: [
      RepoUrlParameter,
      BaseParameterOptional,
      PullRequestStateOptional,
    ],
    // The implementation of the sync, which must return an array of objects
    // that fit the pullRequestSchema above, representing a single page of
    // results, and optionally a `continuation` if there are subsequent pages
    // of results to fetch.
    execute: async function (params, context) {
      return helpers.getPullRequests(params, context);
    },
  },
});

// Add the sync table for issues
pack.addSyncTable({
  name: "Issues",
  identityName: "Issue",
  schema: schemas.IssueSchema,
  formula: {
    name: "SyncIssues",
    description: "Sync issues from a GitHub repository.",
    parameters: [
      RepoUrlParameter,
      coda.makeParameter({
        type: coda.ParameterType.String,
        name: "state",
        description:
          'Returns issues in the given state. If unspecified, defaults to "open".',
        optional: true,
        autocomplete: [
          { display: "Open issues only", value: "open" },
          { display: "Closed issues only", value: "closed" },
          { display: "All issues", value: "all" },
        ],
      }),
    ],
    execute: async function (params, context) {
      return helpers.getIssues(params, context);
    },
  },
});

// Add the action formula for updating issues
pack.addFormula({
  name: "UpdateIssue",
  description: "Update an issue on GitHub.",
  parameters: [
    RepoUrlParameter,
    IssueNumberParameter,
    IssueTitleParameter,
    IssueBodyParameter,
    IssueStateParameter,
  ],
  resultType: coda.ValueType.Object,
  schema: schemas.IssueSchema,
  execute: async function (params, context) {
    return helpers.updateIssue(params, context);
  },
});

const TitleParameter = coda.makeParameter({
  type: coda.ParameterType.String,
  name: "title",
  description: "The title of the issue.",
});

const BodyParameter = coda.makeParameter({
  type: coda.ParameterType.String,
  name: "body",
  description: "The body content of the issue.",
  optional: true,
});

const LabelsParameter = coda.makeParameter({
  type: coda.ParameterType.String,
  name: "labels",
  description: "Comma-separated list of labels to assign to the issue.",
  optional: true,
});

const AssigneesParameter = coda.makeParameter({
  type: coda.ParameterType.String,
  name: "assignees",
  description: "Comma-separated list of assignees for the issue.",
  optional: true,
});

// Add the action formula for creating issues
pack.addFormula({
  name: "CreateIssue",
  description: "Create a new issue on GitHub.",
  parameters: [
    RepoUrlParameter,
    TitleParameter,
    BodyParameter,
    LabelsParameter,
    AssigneesParameter,
  ],
  resultType: coda.ValueType.Object,
  schema: schemas.IssueSchema,
  execute: async function (params, context) {
    return helpers.createIssue(params, context);
  },
});
