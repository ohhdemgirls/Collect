import scrape = require('website-scraper');
import crypto = require('crypto');
import fs = require('fs');
import murl = require('url');
import mpath = require('path')
import extractor = require('unfluff');
import getFolderSize = require('get-folder-size');

export function website(url: string, depth: number = 0, callback: (err: Error, result: ContentDescription, fromCache: boolean) => void): void {
    if (url === null) {
        return callback(new ReferenceError("url is null"), null, null);
    }
    ContentDescription.contains(url, function (err, contains, item) {
        if (err == null && contains) {
            return callback(null, item, true);
        }

        findValidDir(url, function (dir: string): void {
            var options = {
                urls: [
                    { url: url, filename: getFileName(url) }
                ],
                directory: mpath.join("public", "s", dir),
                maxRecursiveDepth: 1,
                recursive: depth !== 0,
                maxDepth: depth > 1 ? depth : null
            };

            scrape(options, function (error, results) {
                if (error) {
                    return callback(error, null, null);
                }

                var result = results[0];// Because we only download one

                if (!result.saved) {
                    return callback(new Error("Couldn't save file"), null, null);
                }

                //Check again, maybe there was a redirect 
                ContentDescription.contains(result.url, function (err, contains, item) {
                    if (err == null && contains) {
                        return callback(null, item, true);
                    }
                    getFolderSize(mpath.join("public", "s", dir), function (err, size) {
                        if (err) {
                            return callback(err, null, null);
                        }

                        var indexPath = mpath.join(dir,
                            result.filename);

                        fs.readFile(mpath.join('public', 's', indexPath), function (err, content) {
                            var parser: any;
                            try {
                                parser = extractor.lazy(content, 'en');
                            } catch{ }

                            var title: string = "No title";
                            try {
                                title = parser.title();
                            } catch{ }

                            // Save to index file
                            var cd = new ContentDescription(result.url,
                                indexPath,
                                dir,
                                murl.parse(result.url, false).hostname,
                                new Date(),
                                title,
                                size
                            );

                            ContentDescription.addContent(cd, function (err) {
                                if (err) {
                                    return callback(err, null, false);
                                }
                                return callback(null, cd, false);
                            });
                        });
                    });
                });
            });
        });
    });
}

//We assume that urls with these extensinos return html
const html_exts = [".asp", ".php", ".html", ".jsp"]

function getFileName(url: string): string {
    // /path/asdf.jpg
    var urlpath = murl.parse(url, false).pathname;

    // asdf.jpg
    var base = mpath.basename(urlpath)

    if (base != "" && base != null) {
        // .jpg
        var ext = mpath.extname(base);
        if (ext === null || ext === "" || html_exts.some(item => ext == item)) {
            ext = "html";
        } else {
            ext = ext.substr(1, ext.length);
        }

        var bsplit = base.split('.');

        bsplit.pop();
        bsplit.push(ext);

        return bsplit.join('.');
    } else {
        return "index.html";
    }

}

function findValidDir(url: string, callback: (path: string) => void) {
    // 25 bytes => 50 chars
    crypto.randomBytes(25, function (err, buffer) {
        var path = murl.parse(url, false).host + "-" + buffer.toString('hex');
        fs.exists(mpath.join("public", "s", path), function (exists: boolean) {
            if (exists) {
                findValidDir(url, callback);
            } else {
                return callback(path);
            }
        });
    });
}

// Source: https://stackoverflow.com/a/14919494/5728357
export function humanFileSize(bytes, si) {
    var thresh = si ? 1000 : 1024;
    if (Math.abs(bytes) < thresh) {
        return bytes + ' B';
    }
    var units = si
        ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
        : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    var u = -1;
    do {
        bytes /= thresh;
        ++u;
    } while (Math.abs(bytes) >= thresh && u < units.length - 1);
    return bytes.toFixed(1) + ' ' + units[u];
}

export class ContentDescription {
    public url: string;
    public title: string;
    public id: string;
    public pagepath: string;
    public domain: string;
    public saved: Date;
    public size: number;
    constructor(_url: string, _pagepath: string, _id: string, _domain: string, _date: Date, _title: string, _size: number) {
        this.url = _url;
        this.pagepath = _pagepath || "";
        this.id = _id;
        // www.reddit.com == reddit.com, while test.reddit.com should be treated as subdomain/new domain
        if (_domain.startsWith("www."))
            _domain = _domain.substr(4, _domain.length - 4);
        this.domain = _domain;
        this.saved = _date || new Date();
        this.title = _title || "No title";
        this.size = _size;
    }

    static readonly CONTENT_FILE = mpath.join("public", "s", "content.json");

    private static loadFile(callback: (err: Error, result: Array<ContentDescription>) => void): void {
        fs.readFile(ContentDescription.CONTENT_FILE, "utf-8", function (err, file_content) {
            if (err) {
                //File doesn't exist, so we return an empty array
                if (err.errno === -4058) {
                    return callback(null, []);
                } else {
                    return callback(err, null);
                }
            }
            try {
                return callback(null,
                    JSON.parse(file_content));
            } catch (e) {
                return callback(e, null);
            }
        });
    }

    private static saveFile(data: Array<ContentDescription>, callback: (err: Error) => void): void {
        fs.writeFile(ContentDescription.CONTENT_FILE, JSON.stringify(data), "utf-8", callback);
    }

    public static getSaved(callback: (err: Error, result: Array<ContentDescription>) => void): void {
        ContentDescription.loadFile(callback);
    }

    public static addContent(desc: ContentDescription, callback: (err: Error) => void): void {
        ContentDescription.loadFile(function (err, result) {
            if (err) {
                return callback(err);

            }
            result.push(desc);
            ContentDescription.saveFile(result, callback);
        });
    }

    public static contains(url: string, callback: (err: Error, result: boolean, item: ContentDescription) => void): void {
        ContentDescription.loadFile(function (err, result) {
            if (err) {
                return callback(err, null, null);
            }
            var index = result.findIndex(item => item.url === url);
            if (index != -1) {
                return callback(null, true, result[index]);
            } else {
                return callback(null, false, null);
            }
        });
    }
}