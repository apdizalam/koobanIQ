/// <reference types="node" />
// This test runs in Node (Jest), so it may read files.
import { readFileSync } from 'fs';
import { join } from 'path';
import type * as Notifications from 'expo-notifications';

// Firebase push setup: what a tapped notification does, and the Android config.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

// eslint-disable-next-line import/first -- after the router mock
import { openFromPush } from '../src/notifications/PushSetup';
// eslint-disable-next-line import/first
import { jobIdOf, responseKey } from '../src/notifications/push';

let counter = 0;
const tap = (data: Record<string, unknown>, identifier: string | undefined = `n-${++counter}`) =>
  ({
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: { request: { identifier, content: { data } } },
  }) as unknown as Notifications.NotificationResponse;

beforeEach(() => mockPush.mockClear());

describe('tapping a push', () => {
  it('a job-match push opens that job; an announcement opens the notifications list', () => {
    openFromPush(tap({ type: 'strong_match', jobId: '6650f0c2a1b2c3d4e5f60718' }));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/job/[id]',
      params: { id: '6650f0c2a1b2c3d4e5f60718' },
    });
    openFromPush(tap({ type: 'announcement', notificationId: 'a1' }));
    expect(mockPush).toHaveBeenLastCalledWith('/notifications');
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('the same tap is handled once (cold start + listener), different taps each once', () => {
    const first = tap({ jobId: 'job1' }, 'same-id');
    openFromPush(first); // the tap that started the app
    openFromPush(first); // the listener reporting the same tap
    expect(mockPush).toHaveBeenCalledTimes(1);
    openFromPush(tap({ jobId: 'job1' }, 'another-id'));
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('missing, empty or unusable data does nothing (no crash, no bad address)', () => {
    openFromPush(null);
    openFromPush(tap({}));
    openFromPush(tap({ type: 'strong_match' }));
    openFromPush(tap({ jobId: 42 }));
    openFromPush(tap({ jobId: '../admin' }));
    openFromPush(tap({ jobId: 'a b' }));
    openFromPush(tap({ jobId: 'x'.repeat(65) }));
    openFromPush(tap({ type: 'something-new' }));
    expect(mockPush).not.toHaveBeenCalled();
    expect(
      jobIdOf({ notification: { request: {} } } as unknown as Notifications.NotificationResponse),
    ).toBeNull();
  });

  it('a push without an id is still opened (older pushes)', () => {
    const old = tap({ jobId: 'job2' }, '');
    expect(responseKey(old)).toBeNull();
    openFromPush(old);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});

describe('Android notification setup (app.json)', () => {
  const app = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8')).expo;
  const plugin = app.plugins.find(
    (p: unknown) => Array.isArray(p) && p[0] === 'expo-notifications',
  )?.[1] as { icon: string; color: string; defaultChannel: string };

  it('uses the expo-notifications plugin with the KOBANIQ icon, colour and channel', () => {
    expect(plugin).toBeTruthy();
    expect(plugin.color).toBe('#1E3A5F');
    // The channel push.ts creates before asking permission.
    const push = readFileSync(join(__dirname, '..', 'src', 'notifications', 'push.ts'), 'utf8');
    expect(push).toContain(`setNotificationChannelAsync('${plugin.defaultChannel}'`);
  });

  it('the notification icon is a 96x96 PNG with transparency (Android uses only its shape)', () => {
    const png = readFileSync(join(__dirname, '..', plugin.icon));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(96); // width
    expect(png.readUInt32BE(20)).toBe(96); // height
    expect(png[25]).toBe(6); // colour type 6 = RGBA (has transparency)
  });

  it('the Android package stays com.kobaniq.app', () => {
    expect(app.android.package).toBe('com.kobaniq.app');
  });

  it('google-services.json, when present, is referenced and belongs to com.kobaniq.app', () => {
    const file = app.android.googleServicesFile as string | undefined;
    if (!file) return; // Added once the owner has created the Firebase project.
    const config = JSON.parse(readFileSync(join(__dirname, '..', file), 'utf8')) as {
      client: { client_info: { android_client_info: { package_name: string } } }[];
    };
    const packages = config.client.map((c) => c.client_info.android_client_info.package_name);
    expect(packages).toContain('com.kobaniq.app');
  });
});
