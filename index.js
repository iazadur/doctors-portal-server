const express = require('express')
const cors = require('cors')
const app = express()
require('dotenv').config()
const { MongoClient } = require('mongodb');
const admin = require("firebase-admin");
const ObjectId = require('mongodb').ObjectId
const stripe = require('stripe')(process.env.STRIPE_SECRET)
const fileupload = require('express-fileupload')

// DB_USER=doctorsDB
// DB_PASS=YxyuBKsMkQ5UGHAw

const port = process.env.PORT || 5000

// doctors-portal-2a835-firebase-adminsdk-gksn2-8223ec5645.json


const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

app.use(cors())
app.use(express.json())
app.use(fileupload())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ddn3a.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });


async function verifyToken(req, res, next) {
    if (req?.body?.authorization?.startsWith('Bearer ')) {
        const token = req?.body?.authorization?.split(' ')[1]
        try {
            const decodedUser = await admin.auth().verifyIdToken(token)
            req.decodedEmail = decodedUser.email
        } catch (error) {

        }
    }
    next()
}

async function run() {
    try {
        await client.connect();
        const database = client.db('doctors_portal');
        const appointmentsCollection = database.collection('appointments')
        const usersCollection = database.collection('users')
        const doctorsCollection = database.collection('doctors')

        // Insert Appointments into Database
        app.post('/appointments', async (req, res) => {
            const appointment = req.body
            const result = await appointmentsCollection.insertOne(appointment)
            res.json(result)
        })
        // Update Appointments into Database
        app.put('/appointments/:id', async (req, res) => {
            const id = req.params.id
            const payment = req.body
            const filter = { _id: ObjectId(id) }
            const updateDoc = {
                $set: {
                    payment: payment
                }
            }
            const result = await appointmentsCollection.updateOne(filter, updateDoc)
            res.json(result)
        })

        // Get Appointments into Database
        app.get('/appointments', verifyToken, async (req, res) => {
            const email = req.query.email
            const date = req.query.date
            const query = { email: email, date: date }
            const cursor = appointmentsCollection.find(query)
            const appointments = await cursor.toArray()
            // const appointments = await appointmentsCollection.find({ email: req.query.email }).toArray()
            res.json(appointments)
        })


        // Get Appointments into Database
        app.get('/appointments/:id', verifyToken, async (req, res) => {
            const id = req.params.id
            const query = { _id: ObjectId(id) }
            const result = await appointmentsCollection.findOne(query)
            res.json(result)
        })



        // DOCTORS
        // insert new Doctors into doctorsCollection
        app.post('/doctors', async (req, res) => {
            console.log('body:', req.body);
            console.log('body:', req.files);
            const name = req.body.name
            const email = req.body.email
            const pic = req.files.image
            const encodedImage = pic.data.toString('base64')
            const imageBuffer = Buffer.from(encodedImage, 'base64')
            const doctor = {
                name,
                email,
                image: imageBuffer
            }
            const result = await doctorsCollection.insertOne(doctor)
            res.json(result)
        })

        // Read All Doctors into doctorsCollection
        app.get('/doctors', async (req, res) => {
            const result = await doctorsCollection.find({}).toArray()
            res.json(result)
        })




        // Get Admin or normal users into UsersCollection
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            let isAdmin = false
            if (user?.role === 'admin') {
                isAdmin = true
            }
            res.json({ admin: isAdmin })
        })


        // Insert New Users into usersCollection
        app.post('/users', async (req, res) => {
            const result = await usersCollection.insertOne(req.body)
            res.json(result)
        })
        // update || intsert New Users into usersCollection
        app.put('/users', async (req, res) => {
            const user = req.body
            const filter = { email: user.email }
            const options = { upsert: true };
            const updateDoc = { $set: user };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.json(result)
        })

        // Update Admin role into usersCollection
        app.put('/users/admin', verifyToken, async (req, res) => {
            const user = req.body
            const requester = req.decodedEmail
            if (requester) {
                const requesterAccount = await usersCollection.findOne({ email: requester })
                if (requesterAccount.role === 'admin') {
                    const filter = { email: user.email }
                    const updateDoc = { $set: { role: 'admin' } };
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    console.log(result);
                    res.json(result)
                }
            }
            else {
                res.status(403).json({ message: 'you do not access to make Admin' })
            }


        })


        // Payment Stripe 
        app.post("/create-payment-intent", async (req, res) => {
            const paymentInfo = req.body
            console.log(paymentInfo);
            const amount = parseInt(paymentInfo.price) * 100
            console.log(amount);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "eur",
                payment_method_types: ["card"],
            })
            res.json({ clientSecret: paymentIntent.client_secret })
        })



    } finally {
        // Ensures that the client will close when you finish/error
        //   await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('this is node server')
})

app.listen(port, () => {
    console.log('listening at', port);
})