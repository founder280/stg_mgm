import supertest from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { TEST_PASSWORD } from './fixtures.js';

let app: Express | null = null;

export function testApp(): Express {
  app ??= createApp();
  return app;
}

export const request = () => supertest(testApp());

export async function signIn(username: string, password = TEST_PASSWORD) {
  const response = await request().post('/api/auth/login').send({ username, password });
  if (response.status !== 200) {
    throw new Error(`Sign-in failed for ${username}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return {
    accessToken: response.body.accessToken as string,
    refreshToken: response.body.refreshToken as string,
    user: response.body.user,
  };
}

/** A supertest agent with the bearer token already attached. */
export function as(token: string) {
  return {
    get: (path: string) => request().get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string) => request().post(path).set('Authorization', `Bearer ${token}`),
    patch: (path: string) => request().patch(path).set('Authorization', `Bearer ${token}`),
  };
}
