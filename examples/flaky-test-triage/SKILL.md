---
name: flaky-test-triage
description: Decide whether a failing test found a real bug, is flaky, or is asserting the wrong thing, before anyone changes the code it guards. Use when a test fails intermittently, when CI is red on a rerun that passed, or when someone proposes deleting or retrying a test. Triggers on "flaky test", "test failed in CI", "it passes locally", "just rerun it", "quarantine the test".
---

# Flaky test triage

"Rerun it" is a decision to ship without knowing. Make the decision deliberately instead.

## Three outcomes, and only three

**Real failure.** The test is right and the code is wrong. Fix the code.

**Flaky.** The test is right about intent but wrong about determinism: it depends on wall
clock, ordering, a shared fixture, network, or a race. Fix the determinism, not the
assertion.

**Wrong assertion.** The test encodes a belief that was never true, or stopped being true
deliberately. Fix the test, and say which of the two it was.

## How to tell them apart

Run it in isolation, then in its own suite, then with the suite shuffled. A test that
passes alone and fails in a suite is sharing state with a sibling. A test that fails in
both is real until proven otherwise.

Run it twenty times. A failure rate near 100% is real; near 50% is a race; near 1% is
usually a timeout that is too tight for a loaded runner.

**Check whether it has ever passed for the right reason.** A test that has been green since
it was written may have been vacuous from the start, in which case its first failure is the
first time it did its job.

## The rule that matters

**Never quarantine a test without an owner and a date.** A quarantined test with neither is
a deleted test that still costs runtime.
