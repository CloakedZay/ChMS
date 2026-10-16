// Who can do what (src/app/lib/permissions.js). These checks follow the
// "FaithSync User Roles & Permissions" doc; the database rules enforce the
// same thing on the data itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES, STAFF_ROLES, PERMISSIONS, PAGE_FEATURES,
  accessFor, can, canOpenPage, homePathFor,
} from '../src/app/lib/permissions.js';

test('every role in the permission table is a known role', () => {
  for (const [feature, roles] of Object.entries(PERMISSIONS)) {
    for (const role of Object.keys(roles)) {
      assert.ok(ROLES.includes(role), `${feature} lists unknown role "${role}"`);
    }
  }
});

test('every page lists only features that exist', () => {
  for (const [path, features] of Object.entries(PAGE_FEATURES)) {
    for (const f of features ?? []) assert.ok(f in PERMISSIONS, `${path} uses unknown feature "${f}"`);
  }
});

test('accessFor returns a list, empty when there is no access', () => {
  assert.deepEqual(accessFor('finance', 'finance'), ['edit']);
  assert.deepEqual(accessFor('leader', 'expenseRequests'), ['submit', 'approve']);
  assert.deepEqual(accessFor('admin', 'finance'), []);
  assert.deepEqual(accessFor('member', 'no-such-feature'), []);
});

test('edit, approve and submit also let you view', () => {
  assert.equal(can('secretary', 'members'), true);      // edit
  assert.equal(can('leader', 'events'), true);          // approve
  assert.equal(can('secretary', 'events'), true);       // submit
  assert.equal(can('leader', 'finance', 'edit'), false);
});

test('names-only and own access do not count as view', () => {
  assert.equal(can('finance', 'members'), false);
  assert.equal(can('finance', 'members', 'names'), true);
  assert.equal(can('member', 'members'), false);
  assert.equal(can('member', 'members', 'own'), true);
});

test('finance: no Admin, no Secretary, no Member; only Finance edits', () => {
  for (const role of ['admin', 'secretary', 'member']) assert.equal(can(role, 'finance'), false, role);
  assert.equal(can('finance', 'finance', 'edit'), true);
  assert.equal(can('pastor', 'finance', 'edit'), false);
});

test('events: Leaders approve, the Secretary submits, the Pastor only views', () => {
  assert.equal(can('leader', 'events', 'approve'), true);
  assert.equal(can('secretary', 'events', 'submit'), true);
  assert.equal(can('secretary', 'events', 'approve'), false);
  assert.equal(can('pastor', 'events', 'approve'), false);
  assert.equal(can('pastor', 'events'), true);
});

test('the journal is private: everyone has own access, nobody views others', () => {
  for (const role of ROLES) {
    assert.deepEqual(accessFor(role, 'journal'), ['own'], role);
    assert.equal(can(role, 'journal'), false, role);
  }
});

test('the Admin manages assistant documents like the Pastor (db/070)', () => {
  assert.equal(can('admin', 'aiDocuments', 'edit'), true);
  assert.equal(can('pastor', 'aiDocuments', 'edit'), true);
  assert.equal(can('secretary', 'aiDocuments'), false);
  assert.equal(can('member', 'aiDocuments'), false);
});

test('only the Admin manages logins', () => {
  for (const role of ROLES) assert.equal(can(role, 'users', 'edit'), role === 'admin', role);
});

test('staff go to /dashboard, members to /member-dashboard', () => {
  for (const role of STAFF_ROLES) assert.equal(homePathFor(role), '/dashboard');
  assert.equal(homePathFor('member'), '/member-dashboard');
  assert.equal(homePathFor(undefined), '/member-dashboard');
});

test('members cannot open staff pages and staff cannot open member pages', () => {
  assert.equal(canOpenPage('member', '/dashboard'), false);
  assert.equal(canOpenPage('member', '/dashboard/journal'), false);
  assert.equal(canOpenPage('pastor', '/member-dashboard'), false);
  assert.equal(canOpenPage('member', '/member-dashboard'), true);
});

test('pages open only with access to one of their features', () => {
  assert.equal(canOpenPage('finance', '/dashboard/finance'), true);
  assert.equal(canOpenPage('secretary', '/dashboard/finance'), false);
  assert.equal(canOpenPage('finance', '/dashboard/members'), false); // names only
  assert.equal(canOpenPage('admin', '/dashboard/users'), true);
  assert.equal(canOpenPage('pastor', '/dashboard/users'), false);
  assert.equal(canOpenPage('pastor', '/dashboard/activity'), true);  // screen time
});

test('an unknown page is closed to everyone', () => {
  for (const role of ROLES) {
    assert.equal(canOpenPage(role, '/dashboard/secret'), false, role);
    assert.equal(canOpenPage(role, '/member-dashboard/secret'), false, role);
  }
});
