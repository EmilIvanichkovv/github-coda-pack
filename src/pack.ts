import * as coda from "@codahq/packs-sdk";
import * as schemas from "./schemas";
import * as types from "./types";
import * as helpers from "./helpers";

export const pack = coda.newPack();

// Allow the Pack to access the GitHub domain.
pack.addNetworkDomain("github.com");
// pack.addNetworkDomain("api.github.com");

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
