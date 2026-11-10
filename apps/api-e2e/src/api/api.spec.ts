import axios from 'axios';

describe('GET /api/health', () => {
  it('reports application health and database status', async () => {
    const res = await axios.get('/api/health');

    expect(res.status).toBe(200);
    expect(res.data.status).toBe('ok');
    expect(res.data.database.status).toBe('up');
    expect(typeof res.data.uptimeSeconds).toBe('number');
    expect(new Date(res.data.timestamp).toString()).not.toBe('Invalid Date');
  });
});
