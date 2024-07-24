/**
 * Semantic release configuration.
 * https://semantic-release.gitbook.io/semantic-release/usage/configuration
 *
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: ['main', { name: 'exp-*', prerelease: true }],
}
