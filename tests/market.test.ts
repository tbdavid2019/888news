import assert from "node:assert/strict";
import { test } from "node:test";
import { parseYahooChartQuote } from "@aihot/backend/providers/market";

test("parseYahooChartQuote correctly extracts price and percentage change", () => {
  const mockYahooResponse = {
    chart: {
      result: [
        {
          meta: {
            currency: "USD",
            symbol: "NVDA",
            exchangeName: "NMS",
            shortName: "NVIDIA Corporation",
            regularMarketPrice: 125.5,
            chartPreviousClose: 124.0,
            regularMarketTime: 1718000000,
          },
        },
      ],
    },
  };

  const quote = parseYahooChartQuote(mockYahooResponse, "NVDA");
  assert.ok(quote);
  assert.equal(quote.ticker, "NVDA");
  assert.equal(quote.price, 125.5);
  assert.equal(quote.changeAmount, 1.5);
  assert.equal(quote.changePercent, 1.2097);
  assert.equal(quote.exchange, "NMS");
  assert.equal(quote.name, "NVIDIA Corporation");
});
