require('dotenv').config()
const express = require('express');
const jwt = require('jsonwebtoken');
const app = express()
const stripe=require('stripe')(process.env.STRIPE_SECRET_KEY);


const cors=require('cors')
const port = process.env.PORT || 5000;


// middleware
app.use(cors())
app.use(express.json())




const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.d0x6rpk.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const database=client.db('bistroDb')
    const menuCollection=database.collection('menuCollection')
    const userCollection=database.collection('users')
    const reviewCollection=database.collection('reviews')
    const cartsCollection=database.collection('carts')
    const paymentCollection=database.collection('payments')


    // jwt related api
    app.post('/jwt',async(req,res)=>{
      const user=req.body;
      const token=jwt.sign(user,process.env.ACCESS_TOKEN_SECRET,{
        expiresIn:'10d'
      })
      res.send({token})
    })

    // verify token
    const verifyToken=(req,res,next)=>{
      
      if(!req.headers.authorization){
        return res.status(401).send({message:'unauthorized access'})
      }
      const token=req.headers.authorization
      jwt.verify(token,process.env.ACCESS_TOKEN_SECRET,(err,decoded)=>{
        if(err){
          return res.status(401).send({message:'unauthorized access'})
        }
        req.decoded=decoded;
        next();
      })
      
    }
    // user admin verify

    const verifyAdmin=async(req,res,next)=>{
      const email=req.decoded.email;
      const query={email:email}
      const user=await userCollection.findOne(query)
      const isAdmin=user?.role==='admin';
      if(!isAdmin){
        return res.status(403).send({message:'forbidden access'})
      }
      next();
    }

    

    // users related api
    app.post('/users',async(req,res)=>{
      const user=req.body;
      // insert email if user doesn't exist
      const query={email:user.email}
      const exisTingUser=await userCollection.findOne(query)
      if(exisTingUser){
        return res.send({message: 'User already exist',insertedID:null})
      }
      const result=await userCollection.insertOne(user)
      res.send(result)
    })

    app.get('/users',verifyToken,verifyAdmin,async(req,res)=>{
      
      const result =await userCollection.find().toArray()
      res.send(result)
    })

    app.get('/users/admin/:email',verifyToken,async(req,res)=>{
      const email=req.params.email;

      if(email !== req.decoded.email){
        return res.status(403).send({message:'forbidden access'})
      }
      const query={email:email}
      const user=await userCollection.findOne(query)
      let admin=false;
      if(user){
        admin=user?.role==='admin'
      }
      res.send({admin})
    })

    app.delete('/users/:id',async(req,res)=>{
      const id=req.params.id;
      const query={_id : new ObjectId(id)}
      const result=await userCollection.deleteOne(query)
      res.send(result)
    })

    app.patch('/users/admin/:id',verifyToken,verifyAdmin,async(req,res)=>{
      const id=req.params.id;
      const filter={_id: new ObjectId(id)}
      const updateDoc={
        $set:{
          role:'admin'
        }
      }
      const result=await userCollection.updateOne(filter,updateDoc)
      res.send(result)
    })
    
// menu related api
    app.get('/menu',async(req,res)=>{
        const cursor=menuCollection.find();
        const result=await cursor.toArray()
        res.send(result)
    })



    app.get('/menu/:id',async(req,res)=>{
      const id=req.params.id;
      const item={ _id: new ObjectId(id)}
      const cursor=await menuCollection.findOne(item);
        res.send(cursor)
    })

    app.patch('/menu/:id',async(req,res)=>{
      const item=req.body;
      const id=req.params.id;
      const filter={_id: new ObjectId(id)}
      const updatedDoc={
        $set:{
          name:item.name,
          category:item.category,
          price:item.price,
          recipe:item.recipe,
          image:item.image
        }
      }
      const result=await menuCollection.updateOne(filter,updatedDoc)
      res.send(result)
    })



    app.post('/menu',verifyToken,verifyAdmin,async(req,res)=>{
      const item=req.body;
      const result =await menuCollection.insertOne(item)
      res.send(result)
    })

    app.delete('/menu/:id',verifyToken,verifyAdmin,async(req,res)=>{
      const id=req.params.id;
      const query={_id: new ObjectId(id)}
      const result=await menuCollection.deleteOne(query);
      res.send(result)

  })

    app.get('/reviews',async(req,res)=>{
        const cursor=reviewCollection.find();
        const result=await cursor.toArray()
        res.send(result)
    })

    // carts collection
    app.post('/carts',async(req,res)=>{
      const cartItem=req.body;
      const result=await cartsCollection.insertOne(cartItem)
      res.send(result)
    })

      app.get('/carts',async(req,res)=>{
        const email=req.query.email;
        const query={email:email}
        const result=await cartsCollection.find(query).toArray();
        res.send(result)
      })

      app.delete('/carts/:id',verifyToken,verifyAdmin,async(req,res)=>{
        const id=req.params.id;
        const query={_id:new ObjectId(id)}
        const result=await cartsCollection.deleteOne(query)
        res.send(result)
      })

      // payment intent
      app.post('/create-payment-intent',async(req,res)=>{
        const {price}=req.body;
        const amount=parseInt(price*100);
        console.log('amount inside the intent',amount)
        const paymentIntent=await stripe.paymentIntents.create({
          amount: amount,
          currency:'usd',
          payment_method_types:['card']
        });

        res.send({
          clientSecret: paymentIntent.client_secret
        })

      })


      app.post('/payments',async(req,res)=>{
        const payment=req.body;
        const paymentResult=await paymentCollection.insertOne(payment)
        const query={_id:{
          $in:payment.cartIds.map(id=>new ObjectId(id))
        }}
        const deleteResult=await cartsCollection.deleteMany(query)
        res.send({paymentResult,deleteResult})
      })

      app.get('/payments/:email',verifyToken,async(req,res)=>{
        const query={email: req.params.email}
        if(req.params.email !== req.decoded.email){
          return res.status(403).send({message:'forbidden access'})
        }
        const result=paymentCollection.find().toArray()
        res.send(result)
      })



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);






app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})