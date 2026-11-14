// Bundled first-run examples; stable IDs also make manual imports safe to repeat.
module.exports = [
  {
    id: 'example-blank-screen',
    title: 'React app renders a blank screen',
    category: 'Frontend',
    description: 'Diagnose a production page that loads without visible content.',
    steps: [
      {
        text: 'Open browser developer tools and record the first console error.'
      },
      {
        text: 'Check the Network panel for failed JavaScript and CSS requests.'
      },
      {
        text: 'Verify the configured asset base path matches the deployment URL.'
      },
      {
        text: 'Compare required environment variable names with the build configuration.'
      },
      {
        text: 'Deploy a verified build and check the affected route in a fresh browser session.'
      }
    ]
  },
  {
    id: 'example-stale-assets',
    title: 'Users see stale frontend assets',
    category: 'Frontend',
    description: 'Identify caching mismatches after a frontend release.',
    steps: [
      {
        text: 'Compare the displayed release identifier with the expected build.'
      },
      {
        text: 'Inspect cache headers on the HTML document and hashed assets.'
      },
      {
        text: 'Check whether a service worker is serving an older application shell.'
      },
      {
        text: 'Correct HTML cache policy and invalidate only affected CDN paths.'
      },
      {
        text: 'Reload in a clean browser profile and verify both new and existing sessions.'
      }
    ]
  },
  {
    id: 'example-cors',
    title: 'Browser API requests fail with CORS errors',
    category: 'Frontend',
    description: 'Trace rejected cross-origin requests without weakening browser security.',
    steps: [
      {
        text: 'Record the request origin, destination and preflight response.'
      },
      {
        text: 'Confirm the API allowlist includes the exact application origin.'
      },
      {
        text: 'Check that OPTIONS requests reach the CORS middleware before authentication.'
      },
      {
        text: 'Verify credentialed responses use an explicit origin and appropriate credential headers.'
      },
      {
        text: 'Retest the preflight and real request from the affected browser origin.'
      }
    ]
  },
  {
    id: 'example-failed-rollout',
    title: 'Deployment fails its health checks',
    category: 'Deployment',
    description: 'Recover a rollout while keeping the last healthy service available.',
    steps: [
      {
        text: 'Pause the rollout and record the failing revision and health check output.'
      },
      {
        text: 'Compare readiness paths, ports and startup duration with the last healthy revision.'
      },
      {
        text: 'Inspect startup logs for missing configuration or dependency failures.'
      },
      {
        text: 'Follow the approved rollback procedure if the service is degraded.'
      },
      {
        text: 'Verify traffic reaches healthy instances before resuming the rollout.'
      }
    ]
  },
  {
    id: 'example-migration',
    title: 'Database migration blocks a release',
    category: 'Deployment',
    description: 'Assess a failed migration before retrying any schema change.',
    steps: [
      {
        text: 'Pause further deploys and capture the migration identifier and database error.'
      },
      {
        text: 'Inspect migration history to determine which statements completed.'
      },
      {
        text: 'Check for long transactions or locks using read-only database diagnostics.'
      },
      {
        text: 'Review backup availability and agree a recovery plan with the database owner.'
      },
      {
        text: 'Apply the reviewed recovery procedure in staging before production and verify schema compatibility.'
      }
    ]
  },
  {
    id: 'example-image-pull',
    title: 'Container cannot pull its image',
    category: 'Deployment',
    description: 'Resolve image pull failures on a newly deployed workload.',
    steps: [
      {
        text: 'Read workload events to distinguish authentication, missing tag and network errors.'
      },
      {
        text: 'Confirm the image repository and immutable digest exist.'
      },
      {
        text: 'Verify the workload image pull secret and registry permissions.'
      },
      {
        text: 'Check registry connectivity and certificate trust from the affected node.'
      },
      {
        text: 'Retry the rollout after correcting the cause and verify the running digest.'
      }
    ]
  },
  {
    id: 'example-disk-full',
    title: 'Server disk space is nearly exhausted',
    category: 'Infrastructure',
    description: 'Locate disk pressure without deleting application data.',
    steps: [
      {
        text: 'Inspect filesystem usage and inode usage to identify the affected mount.'
      },
      {
        text: 'Measure directory sizes using read-only tools and note unexpected growth.'
      },
      {
        text: 'Check log rotation, retention settings and open file handles.'
      },
      {
        text: 'Arrange capacity expansion or an owner-approved retention change.'
      },
      {
        text: 'Verify free space and monitoring recovery after the approved action.'
      }
    ]
  },
  {
    id: 'example-dns',
    title: 'Service DNS resolution fails intermittently',
    category: 'Infrastructure',
    description: 'Separate resolver failures from application connection problems.',
    steps: [
      {
        text: 'Record failing hostnames, timestamps and affected clients.'
      },
      {
        text: 'Compare resolution through the configured resolver from affected and healthy hosts.'
      },
      {
        text: 'Inspect record values, TTLs and recent DNS changes.'
      },
      {
        text: 'Check resolver health and network access to the configured DNS servers.'
      },
      {
        text: 'Verify resolution across multiple TTL windows after correcting the cause.'
      }
    ]
  },
  {
    id: 'example-tls',
    title: 'HTTPS requests fail certificate validation',
    category: 'Infrastructure',
    description: 'Diagnose expired certificates and incomplete trust chains.',
    steps: [
      {
        text: 'Record the hostname and exact certificate validation error.'
      },
      {
        text: 'Inspect the served certificate dates, subject alternative names and chain.'
      },
      {
        text: 'Verify system time and the intended TLS termination endpoint.'
      },
      {
        text: 'Renew or correct the certificate chain using the approved certificate process.'
      },
      {
        text: 'Test with a normal validating client and confirm renewal monitoring is enabled.'
      }
    ]
  },
  {
    id: 'example-slow-api',
    title: 'API response times rise unexpectedly',
    category: 'General',
    description: 'Find the source of latency using measurements before making changes.',
    steps: [
      {
        text: 'Compare latency percentiles and error rates with the normal baseline.'
      },
      {
        text: 'Use a representative trace to identify slow database or downstream spans.'
      },
      {
        text: 'Inspect resource saturation and recent release or configuration changes.'
      },
      {
        text: 'Apply a reviewed mitigation such as a rollback or capacity adjustment.'
      },
      {
        text: 'Verify latency and error rates recover under normal traffic.'
      }
    ]
  },
  {
    id: 'example-auth',
    title: 'Users are unexpectedly signed out',
    category: 'General',
    description: 'Investigate session failures without recording sensitive tokens.',
    steps: [
      {
        text: 'Record affected session timing and sanitized authentication error codes.'
      },
      {
        text: 'Check identity provider availability and recent signing key rotation.'
      },
      {
        text: 'Verify cookie domain, Secure and SameSite settings for the deployed origin.'
      },
      {
        text: 'Compare server clocks and configured session lifetimes.'
      },
      {
        text: 'Test sign-in, refresh and sign-out with a dedicated test account.'
      }
    ]
  },
  {
    id: 'example-queue',
    title: 'Background jobs stop making progress',
    category: 'General',
    description: 'Trace queue backlog growth and stalled consumers.',
    steps: [
      {
        text: 'Compare queue depth, oldest job age and worker heartbeat metrics.'
      },
      {
        text: 'Inspect sanitized worker errors and identify whether failures affect one job type.'
      },
      {
        text: 'Verify worker credentials and connectivity to the queue and downstream services.'
      },
      {
        text: 'Review retry and idempotency behavior before restarting or replaying jobs.'
      },
      {
        text: 'Apply the approved recovery action and monitor backlog drain and duplicate side effects.'
      }
    ]
  }
]
