
var Phantom = require('phantom')
  , http = require('http')
  , cache_manager = require('cache-manager')
  , cache;

if (process.argv[2] != null && (process.argv[2] == '-c' || process.argv[2] == '--cache')) {
    console.log('Prerender started with caching turned ON');
    cache = cache_manager.caching({
        store: 'memory', max: 100, ttl: 60/*seconds*/
    });
}

var testCache = function(url, cb) {
    if (cache) return cache.get(url, cb);

    cb(null, null);
}

Phantom.create({
    binary: require('phantomjs').path
}, function(phantom) {

    http.createServer(function (req, res) {
        console.log('getting', req.url);

	    testCache(req.url.substr(1), function (err, result) {
	        if (!err && result != null) {
    	        res.writeHead(200, {'Content-Type': 'text/html'});
    	        res.end(result);
	        } else {	
                //hack to restart phantom if it crashes...for now
                var timeoutID = setTimeout(function() {
                    console.log('restarting phantom due to timeout');
                    Phantom.create(function(ph){
                        phantom = ph;
                        phantom.createPage(onPageCreate);
                    });
                }, 5000);

                var onPageCreate = function(page) {
                    clearTimeout(timeoutID); //wont get hit if phantom has crashed

                    page.open(req.url.substr(1), function (status) {
                        if ('fail' === status) { 
                            res.writeHead(404);
                            res.end();
                            page.close();
                        } else {
                            setTimeout(function(){
                                page.evaluate(function () {
                                    return document && document.getElementsByTagName('html')[0].outerHTML
                                }, function(documentHTML) {
                                    if(!documentHTML) {
                                        res.writeHead(404);
                                        res.end();
                                        return page.close();
                                    }

                                    var matches = documentHTML.match(/<script(?:.*?)>(?:[\S\s]*?)<\/script>/g);

                                    for( var i = 0; matches && i < matches.length; i++) {
                                        documentHTML = documentHTML.replace(matches[i], '');
                                    }
                                    if(cache) cache.set(req.url.substr(1), documentHTML);
                                    res.writeHead(200, {'Content-Type': 'text/html'});
                                    res.end(documentHTML);
                                    page.close();
                                });
                            }, 50);
                        };
                    });
                };

                phantom.createPage(onPageCreate);
            }
        });

    }).listen(process.env.PORT || 3000);
    console.log('Server running on port ' + (process.env.PORT || 3000));
});