// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  apiClient: apiClientMock,
}));

import { ApiRequestError } from '../api/client';
import { quotationApi } from '../services/quotationApi';

describe('quotation invoice conversion API errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves structured failure metadata for operation-receipt recovery', async () => {
    apiClientMock.post.mockResolvedValue({
      data: null,
      error: 'Quotation is not accepted',
      status: 422,
      errorCode: 'QUOTATION_STATE_INVALID',
      requestId: 'req-quote-convert-422',
      recovery: 'Accept the quotation before converting it.',
    });

    const error = await quotationApi.convertQuotationToInvoice('quote-1').catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error.response).toMatchObject({
      status: 422,
      error: 'Quotation is not accepted',
      errorCode: 'QUOTATION_STATE_INVALID',
      requestId: 'req-quote-convert-422',
      recovery: 'Accept the quotation before converting it.',
    });
    expect(apiClientMock.post).toHaveBeenCalledWith('/quotations/quote-1/convert-inv');
  });
});
