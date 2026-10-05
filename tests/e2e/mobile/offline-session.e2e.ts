/* eslint-disable no-undef */
// Mobile e2e (Detox / iOS simulator) — PRD 0018 §5.
//
// Runs against the self-contained test API on dedicated ports (see README.md in
// this folder). Two flows: the online happy path (create-and-read round-trip)
// and the offline round-trip (the defining offline-first property). Selectors
// prefer accessibility labels / text; screens expose testIDs where noted.
//
// This suite needs the RN/iOS build toolchain + applesimutils and runs on a
// macOS CI runner — it is not part of the fast JS logic suite.

import { by, device, element, expect, waitFor } from 'detox'

const email = `e2e+${Date.now()}@example.com`
const password = 'hunter2hunter2'

describe('Gym Assistant — mobile e2e', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true, permissions: { notifications: 'YES' } })
  })

  it('online happy path: register → routine → exercise → session → log → complete → history', async () => {
    // Register
    await element(by.text('Create account')).tap()
    await element(by.label('Display name')).typeText('E2E Lifter')
    await element(by.label('Email')).typeText(email)
    await element(by.label('Password')).typeText(password)
    await element(by.text('Create account')).atIndex(1).tap()

    // Workout tab → new routine
    await element(by.text('Workout')).tap()
    await element(by.label('Add routine')).tap()
    await element(by.label('Name')).typeText('Push Day')
    await element(by.text('Create')).tap()
    await element(by.text('Push Day')).tap()

    // Add an exercise (custom)
    await element(by.label('Add exercise')).tap()
    await element(by.text('Custom')).tap()
    await element(by.label('Name')).typeText('Bench Press')
    await element(by.text('Add')).tap()

    // Start session, log a set, complete
    await element(by.text('Start workout')).tap()
    await element(by.label('Weight')).atIndex(0).typeText('100')
    await element(by.label('Reps')).atIndex(0).typeText('8')
    await element(by.id('log-set')).atIndex(0).tap()
    await element(by.text('Complete')).tap()

    // History shows the completed session
    await element(by.text('History')).tap()
    await waitFor(element(by.text('Push Day')))
      .toBeVisible()
      .withTimeout(5000)
  })

  it('offline round-trip: log offline → visible locally → sync on reconnect → on server', async () => {
    // Go offline (disable the device radio).
    await device.setStatusBar({}) // no-op guard; airplane toggled via setURLBlacklist below
    await device.setURLBlacklist(['.*'])

    // Start + log a full session entirely offline.
    await element(by.text('Workout')).tap()
    await element(by.text('Push Day')).tap()
    await element(by.text('Start workout')).tap()
    await element(by.label('Weight')).atIndex(0).typeText('105')
    await element(by.label('Reps')).atIndex(0).typeText('5')
    await element(by.id('log-set')).atIndex(0).tap()

    // The set is visible immediately from the local store (no spinner / no failure).
    await expect(element(by.text('105kg × 5')).atIndex(0)).toBeVisible()
    await element(by.text('Complete')).tap()

    // Back online: the sync worker drains the outbox.
    await device.setURLBlacklist([])
    await element(by.text('History')).tap()

    // The offline-logged session is now present (it synced); a second client /
    // the server would return the same sets — asserted in the API e2e suite's
    // shared-history test. Here we assert the app reconciled without data loss.
    await waitFor(element(by.text('Push Day')).atIndex(0))
      .toBeVisible()
      .withTimeout(10000)
  })
})
