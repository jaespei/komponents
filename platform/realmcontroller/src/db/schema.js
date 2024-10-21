module.exports = {
    version: "1.0",
    collections: {
        users: {
            '*id': 'str',
            ts: 'int',
            name: 'str',
            surname: 'str',
            email: 'str',
            password: 'str',
            pict: 'str',
            groups: 'str[]',
            perms: 'str[]', // [ <id:r/w/o>]
            /*keys: 'dict[]',
            pictSm: 'str',
            pictMd: 'str',
            pictLg: 'str',
            pictMime: 'str',*/
           
        },
        /*surrogates: {
            '*id': 'str',
            ts: 'int',
            name: 'str',
            key: 'str',
            avatarSmall: 'str',
            avatarMedium: 'str',
            avatarBig: 'str',
            owner: 'str'
        },
        keys: {
            '*id': 'str',
            type: 'str',
            tags: 'str[]',
            content: 'str',
            owner: 'str'
        },*/
        groups: {
            '*id': 'str',
            ts: 'int',
            title: 'str',
            desc: 'str',
            pict: 'str',
            labels: 'str[]',
            perms: 'str[]', // [ <id:r/w/o>]
            /*pictSm: 'str',
            pictMd: 'str',
            pictLg: 'str',
            pictMime: 'str',
            owner: 'str'*/
        },
        /*permissions: {
            '*id': 'str',
            ts: 'int',
            type: 'str',
            role: 'str',
            roleType: 'str',
            resource: 'str',
            resourceType: 'str',
            deny: 'bool'
        },*/
        components: {
            '*id': 'str',
            ts: 'int',
            type: 'str',
            name: 'str',
            title: 'str',
            summary: 'str',
            desc: 'str',
            tags: 'str[]',
            labels: 'str[]',
            model: 'dict',
            layout: 'dict',
            pict: 'str',
            perms: 'str[]'
            /*autoPict: 'bool',
            pictSm: 'str',
            pictMd: 'str',
            pictLg: 'str',
            pictMime: 'str',            
            owner: 'str'*/
        },
        versions: {
            '*id': 'str',
            ts: 'int',
            number: 'int',
            /*type: 'str',
            name: 'str',
            title: 'str',
            summary: 'str',
            desc: 'str',*/
            model: 'str',
            layout: 'str',
            component: 'str',
            owner: 'str'
        },
        /*apps: {
            '*id': 'str',
            ts: 'int',
            name: 'str',
            title: 'str',
            tags: 'str',
            pictSm: 'str',
            pictMd: 'str',
            pictLg: 'str',
            pictMime: 'str',
            status: 'str',
            perms: 'dict[]',
            diagram: 'str',
            version: 'str',
            owner: 'str'
        }, 
        instances: { // instances added to the system
            "*id": "str",
            type: "str", // "composite", "basic", "connector"
            parent: "str", // parent composite instance
            subcomponent: "str", // subcomponent name
            connector: "str", // connector name
            labels: "str[]",
            model: "dict", // instance model
            collection: "str", // collection where the instance is included
            domain: "str", // domain where the real instance is executing
            addr: "str", // instance address
            proxyAddr: "str",   // address for proxies
            data: "dict",
            state: "str",
            last: "int"
        }*/
    }
}