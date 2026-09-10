// Cliente API que chama os API routes do Next.js (servidor)
// Isto resolve problemas de CORS

let cachedToken: string | null = null;
let tokenExpiry: Date | null = null;

interface TokenResponse {
  token: string;
  expires: string;
}

interface AttendanceRecord {
  uuid: string;
  checktype: number;
  checktime: string;
  device: {
    serial_number: string;
    name: string;
  };
  employee: {
    first_name: string;
    last_name: string;
    workno: string;
  };
}

interface RecordsResponse {
  header: {
    nameSpace: string;
    nameAction: string;
    version: string;
    requestId: string;
    timestamp: string;
  };
  payload: {
    count: number;
    list: AttendanceRecord[];
    page: number;
    perPage: number;
    pageCount: number;
  };
}

export async function getAuthToken(): Promise<string> {
  // Verificar se temos um token válido em cache
  if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
    return cachedToken;
  }

  try {
    const response = await fetch('/api/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data: TokenResponse = await response.json();

    if (data.token) {
      cachedToken = data.token;
      tokenExpiry = new Date(data.expires);
      return cachedToken;
    }

    throw new Error('No token in response');
  } catch (error) {
    console.error('Error getting auth token:', error);
    throw error;
  }
}

export async function getAttendanceRecords(
  beginTime: string,
  endTime: string,
  onProgress?: (count: number) => void
): Promise<RecordsResponse> {
  // Invalidate token cache to always get fresh token for new fetches
  const token = await getAuthToken();
  let allRecords: AttendanceRecord[] = [];
  let page = 1;
  const perPage = 200;
  const MAX_PAGES = 50;
  const MAX_RETRIES = 3;

  while (page <= MAX_PAGES) {
    let retries = 0;
    let data: any = null;

    while (retries < MAX_RETRIES) {
      const response = await fetch('/api/attendance/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, beginTime, endTime, page, perPage }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      data = await response.json();

      // Auto-retry on rate limit
      if (data.header?.nameSpace === "System" && data.payload?.type === "FREQUENT_REQUEST") {
        retries++;
        if (retries >= MAX_RETRIES) {
          throw new Error("Limite da API CrossChex excedido. Tente novamente em 30 segundos.");
        }
        // Wait 31 seconds and retry
        if (onProgress) onProgress(-1); // Signal: waiting for rate limit
        await new Promise(resolve => setTimeout(resolve, 31000));
        continue;
      }
      break; // Success, exit retry loop
    }

    const records = data.payload?.list || [];

    if (records.length === 0) break;

    // Strip timezone to avoid Daylight Saving Time (DST) shift on frontend parsing
    const mappedRecords = records.map((r: any) => ({
      ...r,
      checktime: r.checktime.replace(/([+-]\d{2}:\d{2}|Z)$/, '')
    }));

    allRecords = [...allRecords, ...mappedRecords];

    if (onProgress) onProgress(allRecords.length);

    if (records.length < perPage) break;

    page++;
  }

  return {
    header: {
      nameSpace: 'attendance.record',
      nameAction: 'getrecord',
      version: '1.0',
      requestId: 'aggregated',
      timestamp: new Date().toISOString()
    },
    payload: {
      count: allRecords.length,
      list: allRecords,
      page: 1,
      perPage: allRecords.length,
      pageCount: 1
    }
  };
}

export async function getEmployees() {
  try {
    const res = await fetch('/api/employees');
    if (!res.ok) throw new Error(`Failed to fetch employees: ${res.status}`);
    const data = await res.json();
    return (data.employees || []).map((e: any) => ({
      workno: e.workno,
      name: e.name,
      firstName: e.name.split(' ')[0] || '',
      lastName: e.name.split(' ').slice(1).join(' ') || '',
      fullName: e.name,
      scheduleCode: e.scheduleCode,
      scheduleName: e.scheduleName
    }));
  } catch (error) {
    console.error('Error fetching employees:', error);
    return [];
  }
}

export async function getManagedWorknos(): Promise<string[]> {
  try {
    const employees = await getEmployees();
    return employees.map(e => e.workno);
  } catch {
    return [];
  }
}

export async function getSchedules() {
  const response = await fetch('/api/schedules');
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.details || 'Failed to fetch schedules');
  }
  return response.json();
}
