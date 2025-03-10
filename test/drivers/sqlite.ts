import { Database, Statement as DriverStatement } from "bun:sqlite"
import type { 
    Driver, Connection, SyncConnection, DbBinding, Statement, SyncStatement, Dialect,
    Changes, Constructor,
} from "../../src"
import { 
    Sql, DbConnection, NamingStrategy, SyncDbConnection, SqliteDialect, DefaultStrategy, Schema, IS,
    SqliteSchema, SqliteTypes,
} from "../../src"
import { ClassParam } from "../../src/types"

const ENABLE_WAL = "PRAGMA journal_mode = WAL;"

type ConnectionOptions = {
    /**
     * Whether to enable WAL
     * @default "app.db"
     */
    fileName?:string
    /**
     * Whether to enable WAL
     * @default true
     */
    wal?:boolean
    /**
     * Open the database as read-only (no write operations, no create).
     */
    readonly?: boolean
    /**
     * Allow creating a new database
     */
    create?: boolean;
    /**
     * Open the database as read-write
     */
    readwrite?: boolean;
    /**
     * When set to `true`, integers are returned as `bigint` types.
     * When set to `false`, integers are returned as `number` types and truncated to 52 bits.
     * @default false
     */
    safeIntegers?: boolean;
    /**
     * When set to `false` or `undefined`:
     * - Queries missing bound parameters will NOT throw an error
     * - Bound named parameters in JavaScript need to exactly match the SQL query.
     * @default true
     */
    strict?: boolean;
}

/**
 * Create a bun:sqlite SqliteDriver with the specified connection options
 */
export function connect(options?:ConnectionOptions|string) {
    if (typeof options == 'string') {
        const db = new Database(options, { 
            strict: true 
        })
        db.exec(ENABLE_WAL)
        return new SqliteConnection(db, new Sqlite())
    }

    options = options || {}
    if (options.strict !== false) options.strict = true
    if (options.wal !== false) options.wal = true 
    
    const db = new Database(options.fileName ?? "app.db", options)
    if (options?.wal === false) {
        db.exec(ENABLE_WAL)
    }
    return new SqliteConnection(db, new Sqlite())
}

class SqliteStatement<RetType, ParamsType extends DbBinding[]>
    implements Statement<RetType, ParamsType>, SyncStatement<RetType, ParamsType>
{
    native: DriverStatement<RetType, ParamsType>
    $:ReturnType<typeof Sql.create>
    _as?:RetType
    constructor(statement: DriverStatement<RetType, ParamsType>, $:ReturnType<typeof Sql.create>) {
        this.native = statement
        this.$ = $
    }

    as<T extends Constructor<any>>(t:T) {
        const clone = new SqliteStatement(this.native.as(t), this.$)
        clone._as = t
        return clone
    }

    all(...params: ParamsType): Promise<RetType[]> {
        return Promise.resolve(this.all(...params))
    }
    allSync(...params: ParamsType): RetType[] {
        return this.native.all(...params).map(x => this.$.schema.toResult(x, this._as as ClassParam))
    }
    one(...params:ParamsType): Promise<RetType | null> {
        return Promise.resolve(this.oneSync(...params))
    }
    oneSync(...params: ParamsType): RetType | null {
        return this.$.schema.toResult(this.native.get(...params), this._as as ClassParam)
    }

    column<ReturnValue>(...params: ParamsType): Promise<ReturnValue[]> {
        return Promise.resolve(this.native.values(...params).map(row => row[0] as ReturnValue))
    }
    columnSync<ReturnValue>(...params: ParamsType): ReturnValue[] {
        return this.native.values(...params).map(row => row[0] as ReturnValue)
    }

    value<ReturnValue>(...params: ParamsType): Promise<ReturnValue | null> {
        return Promise.resolve(this.native.values(...params).map(row => row[0] as ReturnValue)?.[0] ?? null)
    }
    valueSync<ReturnValue>(...params: ParamsType): ReturnValue | null {
        return this.native.values(...params).map(row => row[0] as ReturnValue)?.[0] ?? null
    }

    arrays(...params: ParamsType): Promise<any[][]> {
        return Promise.resolve(this.native.values(...params))
    }
    arraysSync(...params: ParamsType): any[][] {
        return this.native.values(...params)
    }
    array(...params: ParamsType): Promise<any[] | null> {
        return Promise.resolve(this.native.values(...params)?.[0] ?? null)
    }
    arraySync(...params: ParamsType): any[] | null {
        return this.native.values(...params)?.[0] ?? null
    }

    exec(...params: ParamsType): Promise<Changes> {
        //console.log('params',params)
        return Promise.resolve(this.native.run(...params))
    }
    execSync(...params: ParamsType): Changes {
        //console.log('params',params)
        const ret = this.native.run(...params)
        // console.log('ret',ret)
        return ret
    }

    run(...params: ParamsType): Promise<void> {
        return Promise.resolve(this.native.run(...params)).then(x => undefined)
    }
    runSync(...params: ParamsType):void {
        this.native.run(...params)
    }
}

class Sqlite implements Driver
{
    name: string
    dialect:Dialect
    schema:Schema
    $:ReturnType<typeof Sql.create>
    strategy:NamingStrategy = new DefaultStrategy()

    constructor() {
        this.dialect = new SqliteDialect()
        this.$ = this.dialect.$
        this.name = this.constructor.name
        this.schema = this.$.schema = new SqliteSchema(this, this.$, new SqliteTypes())
    }
}

class SqliteConnection implements Connection, SyncConnection {
    $:ReturnType<typeof Sql.create>
    async: DbConnection
    sync: SyncDbConnection
    schema: Schema
    dialect: Dialect

    constructor(public native:Database, public driver:Driver & {
        $:ReturnType<typeof Sql.create>
    }) {
        this.$ = driver.$
        this.schema = this.$.schema = driver.schema
        this.dialect = driver.dialect
        this.async = new DbConnection(this)
        this.sync = new SyncDbConnection(this)
    }

    prepare<RetType, ParamsType extends DbBinding[]>(sql:TemplateStringsArray|string, ...params: DbBinding[])
        : Statement<RetType, ParamsType extends any[] ? ParamsType : [ParamsType]> {
        if (IS.tpl(sql)) {
            let sb = ''
            for (let i = 0; i < sql.length; i++) {
                sb += sql[i]
                if (i < params.length) {
                    sb += `?${i+1}`
                }
            }
            return new SqliteStatement(this.native.query<RetType, ParamsType>(sb), this.$)
        } else {
            return new SqliteStatement(this.native.query<RetType, ParamsType>(sql), this.$)
        }
    }

    prepareSync<RetType, ParamsType extends DbBinding[]>(sql:TemplateStringsArray|string, ...params: DbBinding[])
        : SyncStatement<RetType, ParamsType extends any[] ? ParamsType : [ParamsType]> {
        if (IS.tpl(sql)) {
            let sb = ''
            for (let i = 0; i < sql.length; i++) {
                sb += sql[i]
                if (i < params.length) {
                    sb += `?${i+1}`
                }
            }
            return new SqliteStatement(this.native.query<RetType, ParamsType>(sb), this.$)
        } else {
            return new SqliteStatement(this.native.query<RetType, ParamsType>(sql), this.$)
        }
    }

    close() {        
        this.native.close()
        return Promise.resolve()
    }
    closeSync() {
        this.native.close()
    }
}
