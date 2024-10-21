# Store

The **store** implements a simple object datastore.

## Table of Contents

- [Introduction](#introduction)
- [Concepts](#concepts)
- [API](#api)
    - [Open](#open)
    - [Search](#search)
    - [Insert](#insert)
    - [Update](#update)
    - [Delete](#delete)   
    - [Close](#close)     
    - [Destroy](#destroy)
    - [Backup and restore](#backup)
- [SQLite](#sqlite)
- [MongoDB](#mongodb)


<a name="introduction"></a>
## Introduction

The **store** implements a [simple object datastore](#concepts). It is a lightweight middleware which covers the actual persistent store and provides an homogeneous API to its consumers, performing fast translations between its published API and the underlying datastore. 

The published [API](#API) has been designed to be simple enough and can be easily translated to most persistent engines, either relational or NoSQL. The API covers all the popular CRUD operations for manipulating data. Additionally, some facilities for working with locks are provided.

For now, two concrete implementations exist: an [SQLite-backed store](#sqlite) and a [MongoDB-backed store](#mongodb).

<a name="concepts"></a>
## Concepts

The **store** contains several collections of objects. Each collection has a name and a well-defined structure, which is provided at [creation time](#open). 

The collection structure includes the names of the object's attributes and their data types. The following data types are currently supported: str, int, float, bool, dict, str[], int[], float[], dict[].

The data types of the object's attributes are constantly checked. If an object with a wrong structure gets inserted into the store, the operation will be rejected.

Within the objects of a collection, the following special attributes are supported:
- **primary key**: tipically used for uniquely identifying the objects of the collection; only one attribute of the collection may become primary key
- **unique key**: it guarantees all the objects of the same collection hold different values for the attribute; multiple attributes of the collection may become unique keys
- **indexed key**: for speeding up searchs by specific attributes; multiple attributes of the collection may become indexed keys

The store supports **locking objects** for avoiding conflicts while accessing common objects from concurrent transactions. Objects may be locked/unlocked in both queries and updates. The typical process would involve the following steps:

1. Before updating an object a lock is set.
1. After updating the object the lock is unset.

<a name="api"></a>
## API

Every store implementation must fulfill a [well-defined interface](./lib/index.js) with a common behavior. In this way, swapping between different stores should be transparent for potential consumers. 

The API usage is simple:
- The store must be initially [opened](#open). The first time it is opened, the store gets automatically created. To that end, the schema of the store must be initially provided.
- Once opened, typicall CRUD operations may be performed: [search](#search), [insert](#insert), [update](#update), [delete](#delete).
- When the job is done, the store should be [closed](#close).

<a name="open"></a>
### Open

Before any other operation, the store must be opened. When opening the store, a configuration object must be provided. The configuration object supports the following properties: 

| Property | Description |
| -------- | ----------- |
| url | *Required*. It determines the location of the datastore |
| schema | It contains information about the datastore structure |
| schema.version | It determines the datastore version. If the specified version does not match the opened datastore the operation is rejected |
| schema.collections | It determines the structure of the datastore collections |

The configuration must contain at least the *url* of the datastore. The url pattern will depend on the concrete store implementation (e.g. for MongoDB the pattern looks like 'mongodb://host/db').

The version of the datastore may be provided in *schema.version*, in order to avoid opening incompatible datastores. If a datastore with a different version is attempted to be opened the operation is automatically rejected.

The first time a datastore is opened, it gets automatically created. To that end, the schema of the datastore must be initially provided in *schema.collections*. The schema is defined using a simple dictionary with the following structure:

```json
{
    <collection-name>: {
        <attribute-name>: <data-type>,
        ...
    },
    <collection-name>: {
        ...
    }
}
```

If an attribute is the primary key of the collection its name must begin with the '*' symbol. If it is a unique key its name must begin with the '+' symbol. If it is an indexed key its name must begin with the '-' symbol. 

The supported data types are: 'str', 'int', 'float', 'bool', 'dict', 'str[]', 'int[]', 'float[]', 'dict[]'.

Next, an example of a simple datastore definition is presented:

```json
{
    url: 'mongodb://localhost/test'
    schema: {
        version: '1.0',
        collections: {
            users: {
                '*id': 'str',        // primary key
                '+photoId', 'str',   // unique key
                name: 'str',
                '-surname': 'str',   // indexed key
                age: 'int',
                addresses: 'str[]',
                profile: 'dict'
            }
        }
    }  
}
```

<a name="search"></a>
### Search

The search operation receives the following parameters:

| Parameter | Description |
| -------- | ----------- |
| colName | *Required*. It determines the collection to consult |
| query | It contains the query |
| opts | Additional options |
| opts.lock | Determines the lock to set before returning the results |
| opts.unlock | Determines the lock to unset after returning the results |
| opts.oderBy | The attribute used for ordering the results in format '[+/-]field' (e.g. '+name') |
| opts.limit | The maximum number of results |
| opts.offset | The initial results to discard |
| opts.fields | Comma-separated list of fields to retrieve (fields beginning by '-' are hidden) |
| cb| The operation callback. It will receive the results of the query |

The query syntax closely resembles MongoDB query syntax. A single query is a dictionary which contains all the conditions the results should meet. The simplest condition involves comparing a given attribute of every object against a single value, and it is specified as an (&lt;attribute&gt;, &lt;value&gt;) pair.

For example, the following query obtains all the objects with name 'John' AND surname 'Dalton':

```json
{
    name: 'John',
    surname: 'Dalton'
}
```

In the case of str, the wildcard symbol is the '*', therefore the following example obtains all the objects with name beginning by 'J'.

```json
{
    name: 'J*'
}
```

Besides checking for equality, depending on the data type of the attribute used in the query, different special operators are supported. For example, if the attribute is a number, comparing whether it is greater (or equals) than or less (or equals) than a given value is something very common. To that end, the pair ($&lt;attribute&gt;_&lt;op&gt;, &lt;value&gt;) may be included in the query, where &lt;op&gt; stands for the special operator. 

For example, the following query obtains all the objects with name 'John' and an age greater than 18:

```json
{
    name: 'John',
    $age_gt: 18
}
```

The next table summarizes all the operators and the expected value, classified by the data type which supports the operator:

| Data type | Operator | Value | Description |
| --------- | -------- | ----- | ----------- |
| str, int, float, bool | eq, neq, gt, gte, lt, lte | str, int, float, bool value respectively | Checks whether the attribute is equals, not equals, greater (or equals) than, less (or equals) than the provided value |
| str, int, float, bool, dict | in | array of str, int, float, bool, dict respectively | Checks whether the attribute is included in the provided array |
| str, int, float, bool, dict | nin | array of str, int, float, bool, dict respectively | Checks whether the attribute is not included in the provided array |
| str[], int[], float[], bool[], dict[] | contains | str[]/str, int[]/int, float[]/float, bool[]/bool, dict[]/dict value respectively | Checks whether the attribute contains all the provided values |
| str[], int[], float[], bool[], dict[] | ncontains | str[]/str, int[]/int, float[]/float, bool[]/bool, dict[]/dict value respectively | Checks whether the attribute does not contain all the provided values |
| str[], int[], float[], bool[], dict[] | containsany | str[], int[], float[], bool[], dict[] value respectively | Checks whether the attribute contains any of the provided values |

To conclude with query syntax, multiple independent queries might be integrated into one composed OR query. To that end, instead of a single query object, an array of query objects should be provided.

On the other hand, locks may be set on the selected objects while executing the query. If locks can not be set after several trials th operation throws an error.

<a name="insert"></a>
### Insert

The insert operation receives the following parameters:

| Parameter | Description |
| -------- | ----------- |
| colName | *Required*. It determines the collection where the object will be inserted |
| data | The object to insert |
| cb| The operation callback |

If the collection contains a primary key and the corresponding attribute is not specified the operation is rejected.

<a name="update"></a>
### Update

The update operation receives the following parameters:

| Parameter | Description |
| -------- | ----------- |
| colName | *Required*. It determines the collection where the object/s will be updated |
| query | *Required*. It specifies the conditions all the objects to update must meet
| data | *Required*. The data to update |
| opts | Additional options |
| opts.lock | Determines the lock to set before updating the objects |
| opts.unlock | Determines the lock to unset after updating the objects |
| cb| The operation callback |

The query syntax follows the same rules as in the [search](#search) operation.

If the lock can not be set after several trials, the operation will end up throwing an error.

<a name="delete"></a>
### Delete

The delete operation receives the following parameters:

| Parameter | Description |
| -------- | ----------- |
| colName | *Required*. It determines the collection where the object/s will be deleted |
| query | *Required*. It specifies the conditions all the objects to delete must meet
| cb| The operation callback |

The query syntax follows the same rules as in the [search](#search) operation.

<a name="close"></a>
### Close

When the store is not needed any more it must be closed. This will close all opened connections and allocated resources in an ordered way.

<a name="destroy"></a>
### Destroy

The *drop()* operation destroys the datastore.

<a name="backup"></a>
### Backup and restore

The *backup()* operation creates a copy of the datastore and returns it in JSON format. It is a time consuming operation.

The *restore()* operation takes as input a copy of a datastore in JSON format and applies it to the current store. It is a time consuming operation.

The backup format is store-independent. This means a backup obtained from an SQLite-backed store can be restored in a MongoDB-backed store without problems.

<a name="sqlite"></a>
## SQLite

The [SQLite implementation](./lib/sqlite.js) performs a simple object-relational mapping to allow storing collections of objects into single files.

When opening the store, a [SQLite supported URL](https://github.com/mapbox/node-sqlite3/wiki/API) must be used. 

Object collections get translated into tables. Simple data types are easily translated to SQL. Arrays and dictionaries are converted to JSON and then stored as strings into the corresponding tables. Primary keys and unique keys are directly mapped to SQL. Indexes are not supported yet.

If an object gets inserted with an attribute not defined at creation time, the data gets stored into an special column called '_bulk'. In this way, unknown attributes are supported.

<a name="mongodb"></a>
## MongoDB

The [MongoDB implementation](./lib/mongodb.js) is more natural, since data mapping is direct.

When opening the store, a [MongoDB supported URL](https://docs.mongodb.com/manual/reference/connection-string/) must be used.

Primary key is mapped to the '_id' attribute of the collection. Unique and indexed keys are automatically indexed.

For implementing locks, the internal attributes '_lock' and '_ts' are added to all objects. The '_lock' attribute stores the lock identifier whereas the '_ts' attribute stores the timestamp when the lock was set. 