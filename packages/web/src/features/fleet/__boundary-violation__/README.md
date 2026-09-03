# Boundary-violation fixtures

This directory proves the dependency rule is enforced rather than documented.

`violation.ts` deliberately imports one feature from another. The test asserts
that ESLint rejects it. Do not repair this file and do not delete it. If lint
stops failing here, the rule has silently stopped working.
