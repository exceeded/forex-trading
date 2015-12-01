var fs = require('fs');
var _ = require('underscore');
var ws = require('nodejs-websocket');
var strategies = require('../lib/strategies');

var port = 8080;
var messageTypes = {
    QUOTE: 1,
    CALL: 2,
    PUT: 3,
    CONNECTED: 4,
    DISCONNECTED: 5
};

// Settings
// var symbols = ['EURGBP', 'AUDNZD', 'NZDUSD', 'AUDCAD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'EURUSD', 'CADJPY', 'AUDJPY'];
var symbols = ['EURGBP', 'AUDNZD', 'NZDUSD', 'AUDCAD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'EURUSD', 'CADJPY'];
var seconds = [56, 57, 58, 59, 0];
var investment = 5;
var strategyFn = strategies.Reversals;

// Data
var symbolStrategies = {};
var quotes = {};
var lastDataPoints = {};

var lastTickTimestamp = null;

var serverOptions = {
    // secure: true,
    // key: fs.readFileSync('./key.pem'),
    // cert: fs.readFileSync('./cert.pem')
};
var serverOptions = ws.createServer(serverOptions, function(client) {
    var timer = null;

    console.log('[' + new Date() + '] New connection');

    client.on('close', function(code, reason) {
        console.log('[' + new Date() + '] Connection closed');

        // Stop the timer on disconnection.
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    });

    client.on('error', function(error) {
        console.error('[' + new Date() + ']', error);
    });

    client.on('text', function(data) {
        try {
            var message = JSON.parse(data);

            switch (message.type) {
                case messageTypes.QUOTE:
                    message.data.forEach(function(quote) {
                        var symbolQuotes = quotes[quote.symbol];

                        // Only record the data if the data pertains to a symbol being monitored.
                        if (symbols.indexOf(quote.symbol) > -1) {
                            // Track the quote data by symbol.
                            seconds.forEach(function(second) {
                                symbolQuotes[second].push(quote);
                            });

                            // Log data to a file.
                            fs.appendFileSync('./data.csv', JSON.stringify(quote) + '\n');
                        }
                    });

                    break;

                case messageTypes.CONNECTED:
                    console.log('[' + new Date() + '] Data socket connected');

                    if (!timer) {
                        // Restart the timer.
                        tickTimer();
                    }

                    break;

                case messageTypes.DISCONNECTED:
                    console.log('[' + new Date() + '] Data socket disconnected');

                    // Stop the timer on disconnection.
                    if (timer) {
                        clearTimeout(timer);
                        timer = null;
                    }

                    break;
            }
        }
        catch (error) {
            console.error('[' + new Date() + ']', error);
        }
    });

    function calculateMinuteData(symbol, second) {
        var symbolQuotes = quotes[symbol][second];
        var lastDataPoint = lastDataPoints[symbol][second];
        var firstQuoteTimestamp;
        var dataPoint = null;
        var dataPointTimestamp = new Date().getTime();

        if (lastDataPoint) {
            firstQuoteTimestamp = lastDataPoint.timestamp + (60 * 1000);
            firstQuoteTimestamp = firstQuoteTimestamp - (new Date(firstQuoteTimestamp).getSeconds() * 1000);

            // Use the first second of the minute for the data point timestamp.
            dataPointTimestamp = firstQuoteTimestamp + (second * 1000);
        }

        // If there are no quotes for the minute, then create one using the previous data point.
        if (symbolQuotes.length === 0 && lastDataPoint) {
            symbolQuotes.push({
                symbol: symbol,
                price: lastDataPoint.close,
                timestamp: firstQuoteTimestamp
            });

            // Log data to a file.
            fs.appendFileSync('./data.csv', JSON.stringify({
                symbol: symbol,
                price: lastDataPoint.close,
                timestamp: firstQuoteTimestamp
            }) + '\n');
        }

        // Nothing can be done if there still are no quotes.
        if (symbolQuotes.length === 0) {
            return;
        }

        dataPoint = {
            symbol: symbol,
            second: second,
            high: _(symbolQuotes).max('price').price,
            low: _(symbolQuotes).min('price').price,
            open: _(symbolQuotes).first().price,
            close: _(symbolQuotes).last().price,
            timestamp: dataPointTimestamp
        };

        quotes[symbol][second] = [];
        lastDataPoints[symbol][second] = dataPoint;

        return dataPoint;
    }

    function tickTimer() {
        var date = new Date();
        var drift = date.getMilliseconds();
        var currentSecond = date.getSeconds();
        var analysis = '';
        var dataPoint;

        // Reset tick data if the last tick was too long ago.
        if (lastTickTimestamp && date.getTime() - lastTickTimestamp > 120000) {
            console.log('[' + new Date() + '] Resetting tick data');

            symbols.forEach(function(symbol) {
                lastDataPoints[symbol] = {};

                seconds.forEach(function(second) {
                    quotes[symbol][second] = [];
                });
            });
        }

        seconds.forEach(function(second) {
            // Enter trades only on specific seconds.
            if (currentSecond === second) {
                // Perform analysis for each symbol.
                symbols.forEach(function(symbol) {
                    dataPoint = calculateMinuteData(symbol, second);

                    if (!dataPoint) {
                        // No data point available, so no analysis can take place.
                        return;
                    }

                    // Log data to a file.
                    fs.appendFileSync('./data.csv', JSON.stringify(dataPoint) + '\n');

                    // Analyze the data to date.
                    analysis = symbolStrategies[symbol][second].analyze(dataPoint);

                    // If analysis sends back a positive result, then tell the client to initiate a trade.
                    if (analysis) {
                        client.sendText(JSON.stringify({
                            type: analysis === 'CALL' ? messageTypes.CALL : messageTypes.PUT,
                            data: {
                                symbol: symbol,
                                investment: investment
                            }
                        }));
                        console.log('[' + new Date() + '] ' + analysis + ' for ' + symbol + ' for $' + investment);
                    }
                });
            }
        });

        lastTickTimestamp = new Date().getTime();
        timer = setTimeout(tickTimer, 1000 - drift);
    }

    // Start the timer.
    tickTimer();
}).listen(port);

symbols.forEach(function(symbol) {
    var settings = require('../../settings/' + symbol + '.js');

    symbolStrategies[symbol] = {};
    quotes[symbol] = {};
    lastDataPoints[symbol] = {};

    // Instantiate a new strategy instance and quote data for the symbol for each second.
    seconds.forEach(function(second) {
        symbolStrategies[symbol][second] = new strategyFn(symbol, settings);
        quotes[symbol][second] = [];
    });
});

console.log('[' + new Date() + '] Server started');
