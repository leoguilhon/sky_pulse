# Geographic scaling measurements

Measured on September 14, 2026 with Node.js 24.15.0 on the development Windows host. Run `npm run profile:aircraft` to reproduce. Synthetic observations contain no provider data or credentials. The script runs the regional workload before the worldwide workload, averages 100 bounding-box filters, then measures 120 active interpolation/GeoJSON preparation frames.

| Input aircraft | Regional matches | Mean filter | Preparation p95 | Full JSON       | Regional JSON |
| -------------- | ---------------- | ----------- | --------------- | --------------- | ------------- |
| 1,000          | 2                | 0.011 ms    | 1.111 ms        | 314,206 bytes   | 631 bytes     |
| 20,000         | 28               | 0.201 ms    | 29.560 ms       | 6,314,404 bytes | 8,861 bytes   |

The regional box is latitude -25 to -20 and longitude -50 to -40. These byte counts measure aircraft arrays without compression or catalog enrichment. Distribution is deterministic and synthetic; actual reductions depend on geography and traffic density.

The dense data-preparation measurement approaches a 33 ms update budget before map workers or GPU work. Therefore views above 5,000 aircraft use a 15 Hz source-update ceiling; smaller views retain 30 Hz. Linear filtering took less than a millisecond in this workload, so a spatial index is not yet justified by this measurement.

These results are CPU preparation measurements, not end-to-end FPS or production capacity guarantees. Hardware, browser, metadata size and concurrent users affect results. The browser integration tests independently verify selectable global points, regional navigation, smaller local queries, resizing, selection removal and existing aircraft inspection/expiry.

For end-to-end profiling, run the application with configured provider credentials, open browser Performance and Network panels, and record 30 seconds each at global, regional and city zoom while a new observation arrives. Record main-thread frame times, worker activity, response bytes and input latency. Confirm that camera movement does not cause additional upstream fetches within the cache TTL, and compare desktop and mobile before increasing deployment capacity. External map tiles and provider latency must be reported separately from aircraft preparation.
