/*
 * H2P - HTML to PDF PHP library
 *
 * JS Converter File
 *
 * LICENSE: The MIT License (MIT)
 *
 * Copyright (C) 2013 Daniel Garajau Pereira
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies
 * or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * @package    H2P
 * @author     Daniel Garajau <http://github.com/kriansa>
 * @copyright  2013 Daniel Garajau <http://github.com/kriansa>
 * @license    MIT License
 */

var args = require('system').args;

var page;
var options = {}

try {
	if (args.length < 2) {
		throw 'You must pass the URI and the Destination param!';
	}

	// Take all options in one JSON param
	options = JSON.parse(args[1]);

} catch (e) {
	errorHandler(e);
}

var initialUrl = options.request.uri + (options.request.method == 'GET' ? '?' + options.request.params : '');

function errorHandler(e) {
	console.log(JSON.stringify({
		success: false,
		response: e.toString()
	}));

	// Stop the script
	phantom.exit(0);
}

var renderPage = function (url) {
	page = require('webpage').create();

	page.customHeaders = options.request.headers;
	phantom.cookies = options.request.cookies;

	page.onNavigationRequested = function (url, type, willNavigate, main) {
		if (main && url != myurl) {
			myurl = url;
			console.log("redirect caught")
			page.close()
			setTimeout('renderPage(myurl)', 1); //Note the setTimeout here
		}
	};

	page.onError = function (msg, trace) {
		system.stderr.writeLine(msg);
		trace.forEach(function (item) {
			system.stderr.writeLine('  ', item.file, ':', item.line);
		});
	};

	page.onResourceError = function(resourceError) {
		// don't stop, but it _seems_ like having this callback defined
		// more gracefully degrades resource failures
		system.stderr.writeLine('= onResourceError()');
		system.stderr.writeLine('  - unable to load url: "' + resourceError.url + '"');
		system.stderr.writeLine('  - error code: ' + resourceError.errorCode + ', description: ' + resourceError.errorString );
	}

	var loadingCheckCount = 1;
	var loadingInterval = undefined;

	var isPageLoaded = function () {
		var hasLoaded = page.evaluate(function () {
			return document.editorDataLoadComplete === true;
		});
		if (hasLoaded) {

			// this is required on phantomjs 2
			// to make sure we are using the appropriate
			// zoom setting (which needs to be 0.75)
			var zoom = page.zoomFactor;
			page.evaluate(function(zoom) {
				return document.querySelector('body').style.zoom = zoom;
			}, zoom);

			page.render(options.destination, { format: options.fileFormat || 'pdf', quality: 80 } );

			console.log(JSON.stringify({
				success: true,
				response: null
			}));

			// Stop the script
			phantom.exit(0);

			stopPageWatcher();
		}
		loadingCheckCount = loadingCheckCount + 1;
		if (loadingCheckCount > 20) {
			console.log(JSON.stringify({
				success: false,
				error: "Page did not signal load within 10 seconds",
				response: null
			}));
			stopPageWatcher();
			phantom.exit(1);
		}
	}

	var stopPageWatcher = function () {
		if (loadingInterval !== undefined) {
			clearInterval(loadingInterval);
		}
	}

	page.settings.javascriptEnabled = true;

	page.open(url, options.request.method, options.request.params, function (status) {

		try {
			if (status !== 'success') {
				throw 'Unable to access the URI: ' + url + ' (Make sure you\'re using a .html extension if you\'re trying to use a local file)';
				phantom.exit(1);
			}

			var paperSize = {
				format: options.format,
				orientation: options.orientation,
				border: options.border
			};

			// If we enable custom footer per page, evaluate it
			if (options.allowParseCustomFooter || options.allowParseCustomHeader) {
				var customOptions = page.evaluate(function () {
					return (typeof _h2p_options == "object"
					&& (typeof _h2p_options.footer == "object" || typeof _h2p_options.header == "object"))
						? _h2p_options : {};
				});
			}

			if (options.allowParseCustomFooter && customOptions.footer) {
				options.footer = options.footer || {height: '1cm', content: ''}; // Avoid some errors
				options.footer = {
					height: customOptions.footer.height || options.footer.height,
					content: customOptions.footer.content || options.footer.content
				}
			}

			if (options.allowParseCustomHeader && customOptions.header) {
				options.header = options.header || {height: '1cm', content: ''}; // Avoid some errors
				options.header = {
					height: customOptions.header.height || options.header.height,
					content: customOptions.header.content || options.header.content
				}
			}

			if (options.footer) {
				paperSize.footer = {
					height: options.footer.height,
					contents: phantom.callback(function (pageNum, totalPages) {
						return options.footer.content.replace('{{pageNum}}', pageNum).replace('{{totalPages}}', totalPages);
					})
				}
			}

			if (options.header) {
				paperSize.header = {
					height: options.header.height,
					contents: phantom.callback(function (pageNum, totalPages) {
						return options.header.content.replace('{{pageNum}}', pageNum).replace('{{totalPages}}', totalPages);
					})
				}
			}

			if (options.viewportSize != null) {
				page.viewportSize = options.viewportSize;
			}
			page.paperSize = paperSize;

			page.zoomFactor = options.zoomFactor;

			setInterval(isPageLoaded, 500);
		} catch (e) {
			errorHandler(e);
		}
	});

}

renderPage(initialUrl);
