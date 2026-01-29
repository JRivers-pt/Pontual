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
      throw new Error(`HTTP error! status: ${response.status}`);
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
  page: number = 1,
  perPage: number = 100
): Promise<RecordsResponse> {
  try {
    const token = await getAuthToken();

    const response = await fetch('/api/attendance/records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        beginTime,
        endTime,
        page,
        perPage
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: RecordsResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching attendance records:', error);
    throw error;
  }
}

export async function getEmployees() {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);

    const records = await getAttendanceRecords(
      startDate.toISOString().replace('Z', '+00:00'),
      endDate.toISOString().replace('Z', '+00:00'),
      1,
      100
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
