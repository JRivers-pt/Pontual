
import { getAuthToken } from '../src/lib/api';

// Manual mock for fetch
const originalFetch = global.fetch;
const mockFetch = async () => {
    return {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: 'CrossChex credentials not configured' }),
    } as Response;
};

async function testErrorHandling() {
    console.log('Testing getAuthToken error handling...');

    // Apply mock
    global.fetch = mockFetch;

    try {
        await getAuthToken();
        console.log('❌ FAILED: getAuthToken did not throw an error');
    } catch (error: any) {
        if (error.message === 'CrossChex credentials not configured') {
            console.log('⚠️  PASSED (UNEXPECTED): Caught specific error message: "CrossChex credentials not configured" - Is it already fixed?');
        } else if (error.message === 'HTTP error! status: 400') {
            console.log('✅ CURRENT BEHAVIOR CONFIRMED: Caught generic error message: "HTTP error! status: 400"');
        } else {
            console.log(`❌ FAILED: Caught unexpected error message: "${error.message}"`);
        }
    } finally {
        // Restore original fetch
        global.fetch = originalFetch;
    }
}

// Run the test
testErrorHandling().catch(console.error);
