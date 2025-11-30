const verbose = process.env.VERBOSE === 'true' || process.env.VERBOSE === '1';

export function log(message: string, data?: any) {
  if (verbose) {
    console.log(`[E2E] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

export function logRequest(method: string, url: string, body?: any) {
  if (verbose) {
    console.log(`\n→ ${method} ${url}`);
    if (body) {
      console.log('Body:', JSON.stringify(body, null, 2));
    }
  }
}

export function logResponse(status: number, data?: any) {
  if (verbose) {
    console.log(`← ${status}`);
    if (data) {
      console.log('Response:', JSON.stringify(data, null, 2));
    }
  }
}
