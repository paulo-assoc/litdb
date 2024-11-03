import { describe, it, expect, beforeAll } from 'bun:test'
import { contacts, Contact } from './data'
import { sync as db, $ } from './db'

describe('SQLite Driver Tests', () => {

    beforeAll(() => {
        db.dropTable(Contact)
        db.createTable(Contact)
        db.insertAll(contacts)
        $.logTable(db.all($.from(Contact)))
    })

    it ('should be able to run a test', () => {
        let getContact = (id:number) => 
            db.single<Contact>`select firstName, lastName from Contact where id = ${id}`

        let contact = getContact(1)!
        $.log(contact)
        expect(contact.firstName).toBe('John')
        expect(contact.lastName).toBe('Doe')

        contact = getContact(2)!
        expect(contact.firstName).toBe('Jane')
        expect(contact.lastName).toBe('Smith')
    })

    it ('should generate Contact Table SQL', () => {

        db.dropTable(Contact)

        expect(db.listTables()).not.toContain(Contact.name)

        db.createTable(Contact)

        expect(db.listTables()).toContain(Contact.name)

        //console.log('contacts[0]', contacts[0])
        db.insert(contacts[0])
    })

})
