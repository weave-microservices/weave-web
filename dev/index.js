const { Weave, TransportAdapters } = require('@weave-js/core')
const WebGateway = require('../lib/index')
const path = require('path')

const broker = Weave({
    nodeId: 'web1',
    transport: {
        adapter: TransportAdapters.Fake()
    }
})

const testBroker = Weave({
    nodeId: 'test-broker',
    transport: {
        adapter: TransportAdapters.Fake()
    }
})

broker.createService({
    name: 'test',
    actions: {
        hello: {
            handler (context) {
                return context.call('$node.actions')
            }
        }
    }
})

broker.createService({
    mixins: [WebGateway()],
    name: 'api',
    settings: {
        assets: {
            folder: path.join(__dirname, 'public')
        },
        routes: [
            {
                path: '/not',
                whitelist: ['test.*']
            },
            {
                path: '/',
                whitelist: ['test.*'],
                rateLimit: {
                    headers: true,
                    limit: 10
                }
            },
            {
                path: '/not',
                whitelist: ['test.*']
            },
        ]
    }
})

testBroker.createService({
    name: 'test',
    version: 2,
    actions: {
        post (context) {
            context.meta.$responseType = 'application/text'
            return new Promise(resolve => {
                setTimeout(() => resolve('sdasdasdas from ' + context.callerNodeId + ' on ' + context.nodeId), 1000)
            })
        }
    }
})

broker.createService({
    name: 'test',
    version: 1,
    actions: {
        post (context) {
            return Promise.reject(new Error('sdasd'))
        }
    }
})
broker.start()
testBroker.start()
