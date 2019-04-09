const isarray = Array.isArray

/**
 * Expose `pathToRegexp`.
 */
module.exports = pathToRegexp
module.exports.parse = parse
module.exports.compile = compile
module.exports.tokensToFunction = tokensToFunction
module.exports.tokensToRegExp = tokensToRegExp

/**
 * The main path matching regexp utility.
 *
 * @type {RegExp}
 */
const PATH_REGEXP = new RegExp([
    // Match escaped characters that would otherwise appear in future matches.
    // This allows the user to escape special characters that won't transform.
    '(\\\\.)',
    // Match Express-style parameters and un-named parameters with a prefix
    // and optional suffixes. Matches appear as:
    //
    // "/:test(\\d+)?" => ["/", "test", "\d+", undefined, "?", undefined]
    // "/route(\\d+)"  => [undefined, undefined, undefined, "\d+", undefined, undefined]
    // "/*"            => ["/", undefined, undefined, undefined, undefined, "*"]
    '([\\/.])?(?:(?:\\:(\\w+)(?:\\(((?:\\\\.|[^\\\\()])+)\\))?|\\(((?:\\\\.|[^\\\\()])+)\\))([+*?])?|(\\*))'
].join('|'), 'g')

function parse (str, options) {
    const tokens = []
    const defaultDelimiter = options && options.delimiter || '/'
    let key = 0
    let index = 0
    let path = ''
    let res

    while ((res = PATH_REGEXP.exec(str)) != null) {
        const escaped = res[1]
        const m = res[0]
        const offset = res.index
        path += str.slice(index, offset)
        index = offset + m.length

        // Ignore already escaped sequences.
        if (escaped) {
            path += escaped[1]
            continue
        }

        const next = str[index]
        const prefix = res[2]
        const name = res[3]
        const capture = res[4]
        const group = res[5]
        const modifier = res[6]
        const asterisk = res[7]

        // Push the current path onto the tokens.
        if (path) {
            tokens.push(path)
            path = ''
        }

        const partial = prefix != null && next != null && next !== prefix
        const repeat = modifier === '+' || modifier === '*'
        const optional = modifier === '?' || modifier === '*'
        const delimiter = res[2] || defaultDelimiter
        const pattern = capture || group

        tokens.push({
            name: name || key++,
            prefix: prefix || '',
            delimiter: delimiter,
            optional: optional,
            repeat: repeat,
            partial: partial,
            asterisk: !!asterisk,
            pattern: pattern ? escapeGroup(pattern) : (asterisk ? '.*' : '[^' + escapeString(delimiter) + ']+?')
        })
    }

    // Match any characters still remaining.
    if (index < str.length) {
        path += str.substr(index)
    }

    // If the path exists, push it onto the end.
    if (path) {
        tokens.push(path)
    }

    return tokens
}

function compile (str, options) {
    return tokensToFunction(parse(str, options))
}

function encodeURIComponentPretty (str) {
    return encodeURI(str).replace(/[\/?#]/g, function (c) {
        return '%' + c.charCodeAt(0).toString(16).toUpperCase()
    })
}

function encodeAsterisk (str) {
    return encodeURI(str).replace(/[?#]/g, function (c) {
        return '%' + c.charCodeAt(0).toString(16).toUpperCase()
    })
}

function tokensToFunction (tokens) {
    // Compile all the tokens into regexps.
    const matches = new Array(tokens.length)

    // Compile all the patterns before compilation.
    for (var i = 0; i < tokens.length; i++) {
        if (typeof tokens[i] === 'object') {
            matches[i] = new RegExp('^(?:' + tokens[i].pattern + ')$')
        }
    }

    return function (obj, opts) {
        var path = ''
        var data = obj || {}
        var options = opts || {}
        var encode = options.pretty ? encodeURIComponentPretty : encodeURIComponent

        for (var i = 0; i < tokens.length; i++) {
            var token = tokens[i]

            if (typeof token === 'string') {
                path += token

                continue
            }

            var value = data[token.name]
            var segment

            if (value == null) {
                if (token.optional) {
                    // Prepend partial segment prefixes.
                    if (token.partial) {
                        path += token.prefix
                    }

                    continue
                } else {
                    throw new TypeError('Expected "' + token.name + '" to be defined')
                }
            }

            if (isarray(value)) {
                if (!token.repeat) {
                    throw new TypeError('Expected "' + token.name + '" to not repeat, but received `' + JSON.stringify(value) + '`')
                }

                if (value.length === 0) {
                    if (token.optional) {
                        continue
                    } else {
                        throw new TypeError('Expected "' + token.name + '" to not be empty')
                    }
                }

                for (var j = 0; j < value.length; j++) {
                    segment = encode(value[j])

                    if (!matches[i].test(segment)) {
                        throw new TypeError('Expected all "' + token.name + '" to match "' + token.pattern + '", but received `' + JSON.stringify(segment) + '`')
                    }

                    path += (j === 0 ? token.prefix : token.delimiter) + segment
                }

                continue
            }

            segment = token.asterisk ? encodeAsterisk(value) : encode(value)

            if (!matches[i].test(segment)) {
                throw new TypeError('Expected "' + token.name + '" to match "' + token.pattern + '", but received "' + segment + '"')
            }

            path += token.prefix + segment
        }

        return path
    }
}

function escapeString (str) {
    return str.replace(/([.+*?=^!:${}()[\]|\/\\])/g, '\\$1')
}

function escapeGroup (group) {
    return group.replace(/([=!:$\/()])/g, '\\$1')
}

function attachKeys (re, keys) {
    re.keys = keys
    return re
}

function flags (options) {
    return options.sensitive ? '' : 'i'
}

function regexpToRegexp (path, keys) {
    // Use a negative lookahead to match only capturing groups.
    var groups = path.source.match(/\((?!\?)/g)

    if (groups) {
        for (var i = 0; i < groups.length; i++) {
            keys.push({
                name: i,
                prefix: null,
                delimiter: null,
                optional: false,
                repeat: false,
                partial: false,
                asterisk: false,
                pattern: null
            })
        }
    }

    return attachKeys(path, keys)
}

function arrayToRegexp (path, keys, options) {
    var parts = []

    for (var i = 0; i < path.length; i++) {
        parts.push(pathToRegexp(path[i], keys, options).source)
    }

    var regexp = new RegExp('(?:' + parts.join('|') + ')', flags(options))

    return attachKeys(regexp, keys)
}

function stringToRegexp (path, keys, options) {
    return tokensToRegExp(parse(path, options), keys, options)
}

function tokensToRegExp (tokens, keys, options) {
    if (!isarray(keys)) {
        options = /** @type {!Object} */ (keys || options)
        keys = []
    }

    options = options || {}

    var strict = options.strict
    var end = options.end !== false
    var route = ''

    // Iterate over the tokens and create our regexp string.
    for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i]

        if (typeof token === 'string') {
            route += escapeString(token)
        } else {
            var prefix = escapeString(token.prefix)
            var capture = '(?:' + token.pattern + ')'

            keys.push(token)

            if (token.repeat) {
                capture += '(?:' + prefix + capture + ')*'
            }

            if (token.optional) {
                if (!token.partial) {
                    capture = '(?:' + prefix + '(' + capture + '))?'
                } else {
                    capture = prefix + '(' + capture + ')?'
                }
            } else {
                capture = prefix + '(' + capture + ')'
            }

            route += capture
        }
    }

    var delimiter = escapeString(options.delimiter || '/')
    var endsWithDelimiter = route.slice(-delimiter.length) === delimiter

    // In non-strict mode we allow a slash at the end of match. If the path to
    // match already ends with a slash, we remove it for consistency. The slash
    // is valid at the end of a path match, not in the middle. This is important
    // in non-ending mode, where "/test/" shouldn't match "/test//route".
    if (!strict) {
        route = (endsWithDelimiter ? route.slice(0, -delimiter.length) : route) + '(?:' + delimiter + '(?=$))?'
    }

    if (end) {
        route += '$'
    } else {
        // In non-ending mode, we need the capturing groups to match as much as
        // possible by using a positive lookahead to the end or next path segment.
        route += strict && endsWithDelimiter ? '' : '(?=' + delimiter + '|$)'
    }

    return attachKeys(new RegExp('^' + route, flags(options)), keys)
}

function pathToRegexp (path, keys, options) {
    if (!isarray(keys)) {
        options = /** @type {!Object} */ (keys || options)
        keys = []
    }

    options = options || {}

    if (path instanceof RegExp) {
        return regexpToRegexp(path, /** @type {!Array} */ (keys))
    }

    if (isarray(path)) {
        return arrayToRegexp(/** @type {!Array} */ (path), /** @type {!Array} */ (keys), options)
    }

    return stringToRegexp(/** @type {string} */ (path), /** @type {!Array} */ (keys), options)
}
