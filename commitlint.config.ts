import type { UserConfig } from '@commitlint/types'

const Configuration: UserConfig = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'header-max-length': [1, 'always', 100],
        'scope-enum': [
            2,
            'always',
            [
                'all',
                'cli',
                'export',
                'state',
                'assets',
                'html',
                'md',
                'schema',
                'deps',
                'docs',
                'ci',
                'build'
            ]
        ],
        'scope-case': [2, 'always', 'lowercase']
    }
}

export default Configuration
