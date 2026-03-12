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
  const perPage = 100;
  const MAX_PAGES = 50; // Safety cap to avoid infinite loops

  while (page <= MAX_PAGES) {
    const response = await fetch('/api/attendance/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, beginTime, endTime, page, perPage }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data: any = await response.json();

    // Check for CrossChex custom exception in a 200 OK response
    if (data.header?.nameSpace === "System" && data.payload?.type === "FREQUENT_REQUEST") {
      throw new Error("Por favor, aguarde 30 segundos entre as atualizações (Limite da API CrossChex).");
    }

    const records = data.payload?.list || [];

    if (records.length === 0) break; // No more records

    allRecords = [...allRecords, ...records];

    if (onProgress) onProgress(allRecords.length);

    // If we received fewer records than requested, we are on the last page.
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
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);

    const records = await getAttendanceRecords(
      startDate.toISOString().replace('Z', '+00:00'),
      endDate.toISOString().replace('Z', '+00:00')
    );

    const employeesMap = new Map();
    records.payload.list.forEach(record => {
      const key = record.employee.workno;
      if (!employeesMap.has(key)) {
        employeesMap.set(key, {
          workno: record.employee.workno,
          firstName: record.employee.first_name,
          lastName: record.employee.last_name,
          fullName: `${record.employee.first_name} ${record.employee.last_name}`
        });
      }
    });

    return Array.from(employeesMap.values());
  } catch (error) {
    console.error('Error fetching employees:', error);
    throw error;
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
