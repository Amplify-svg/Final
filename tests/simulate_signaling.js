const io = require('socket.io-client');

const URL = 'http://localhost:3000';

function createClient(name) {
  const s = io(URL);
  s.on('connect', () => {
    console.log(`${name} connected`, s.id);
    // Register then login to ensure server maps socket -> username
    s.emit('register', { username: name, password: 'pass' });
  });
  s.on('loginResponse', (data) => console.log(`${name} loginResponse:`, data));
  s.on('incoming-call', (data) => console.log(`${name} incoming-call:`, data));
  s.on('call-answered', (data) => console.log(`${name} call-answered:`, data));
  s.on('ice-candidate', (data) => console.log(`${name} ice-candidate:`, data));
  s.on('connect_error', (err) => console.error(`${name} connect_error`, err));
  return s;
}

(async () => {
  const alice = createClient('alice');
  const bob = createClient('bob');

  // wait a bit for logins
  await new Promise(r => setTimeout(r, 1000));

  console.log('--- Emitting call-user from alice to bob ---');
  alice.emit('call-user', { userToCall: 'bob', offer: { type: 'offer', sdp: 'FAKE_SDP_FROM_ALICE' } });

  await new Promise(r => setTimeout(r, 500));
  console.log('--- Emitting answer-call from bob to alice ---');
  bob.emit('answer-call', { to: 'alice', answer: { type: 'answer', sdp: 'FAKE_SDP_FROM_BOB' } });

  await new Promise(r => setTimeout(r, 500));
  console.log('--- Emitting ice-candidate from alice to bob ---');
  alice.emit('ice-candidate', { to: 'bob', candidate: { candidate: 'candidate:1 1 UDP 2122260223 192.0.2.1 3478 typ host' } });

  await new Promise(r => setTimeout(r, 1500));
  alice.close(); bob.close();
  process.exit(0);
})();