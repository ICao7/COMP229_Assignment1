import express from "express";
import { MongoClient } from "mongodb";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// MongoDB and OMDb API connection
const url = process.env.MONGO_DB_SERVER;
const dbName = process.env.MONGODB_DB_NAME;
const collectionName = process.env.MONGODB_COLLECTION_NAME;
const apiKey = process.env.OMDB_API_KEY;
let db, moviesCollection;

app.use(express.json());

// Connect to MongoDB
const client = new MongoClient(url);
async function connectToDB() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");
    db = client.db(dbName);
    moviesCollection = db.collection(collectionName);
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1); 
  }
}

// Connect to the database
connectToDB();

// fetch movie details from OMDb API
async function fetchMovieFromOMDb(query) {
    try {
      const response = await axios.get(`http://www.omdbapi.com/?${query}&apikey=${apiKey}`);
      if (response.data.Response === 'True') {
        const movie = response.data;
        const combinedRating = calculateCombinedRating(movie.Ratings);
  
        return {
          Title: movie.Title,
          Year: movie.Year,
          Rated: movie.Rated,
          Release: movie.Released,
          Runtime: movie.Runtime,
          Plot: movie.Plot,
          Poster: movie.Poster,
          imdbID: movie.imdbID,
          CombinedRating: combinedRating
        };
      } else {
        throw new Error('Movie not found');
      }
    } catch (error) {
      throw new Error('Error fetching movie from OMDb API');
    }
  }
  
  // Calculate CombinedRating from different rating systems
  function calculateCombinedRating(ratings) {
    const ratingParsers = {
      'Internet Movie Database': value => parseFloat(value.split('/')[0]),
      'Rotten Tomatoes': value => parseFloat(value.replace('%', '')) / 10,
      'Metacritic': value => parseFloat(value.split('/')[0]) / 10
    };
  
    const totalRating = ratings.reduce((total, rating) => {
      const parseRating = ratingParsers[rating.Source];
      if (parseRating) {
        return total + parseRating(rating.Value);
      }
      return total;
    }, 0);
  
    const count = ratings.filter(rating => ratingParsers[rating.Source]).length;
    const combinedRating = totalRating / (count || 1); 

    return combinedRating.toFixed(2); 
  }
  

// Route 1: Search Movies (Query Parameter)
app.get('/movies/search', async (req, res) => {
  const { title } = req.query;
  if (!title) {
    return res.status(400).json({ error: 'Enter the required title in the query parameter' });
  }

  try {
    const movieDetails = await fetchMovieFromOMDb(`t=${encodeURIComponent(title)}`);
    res.json(movieDetails);
  } catch (error) {
    res.status(404).json({ error: 'Error searching movie through query parameter' });
  }
});

// Route 2: Search Movies (Path Parameter)
app.get("/movies/:title", async (req, res) => {
  const movieTitle = req.params.title;
  try {
    const movieDetails = await fetchMovieFromOMDb(`t=${encodeURIComponent(movieTitle)}`);
    res.json(movieDetails);
  } catch (error) {
    res.status(404).json({ error: 'Error searching movie through path parameter' });
  }
});

// Route 3: Add to Favourites
app.post('/favourites/:imdbID', async (req, res) => {
  const imdbID = req.params.imdbID;
  try {
    const movieDetails = await fetchMovieFromOMDb(`i=${imdbID}`);
    await moviesCollection.insertOne({ ...movieDetails, deleted: false });
    res.json({ message: 'Movie added to favourites', movie: movieDetails });
  } catch (error) {
    res.status(404).json({ error: 'Error adding movie to favourites list' });
  }
});

// Route 4: Get All Favourites
app.get('/favourites', async (req, res) => {
  try {
    const favourites = await moviesCollection.find({ deleted: { $ne: true } }).toArray();
    res.json(favourites.map(movie => ({
      Title: movie.Title,
      Year: movie.Year,
      Rated: movie.Rated,
      Release: movie.Release,
      Runtime: movie.Runtime,
      Plot: movie.Plot,
      Poster: movie.Poster,
      imdbID: movie.imdbID,
      CombinedRating: movie.CombinedRating
    })));
  } catch (error) {
    res.status(500).json({ error: 'Error adding movie to favourite list' });
  }
});

// Route 5: Delete Favourite (Soft Delete)
app.delete('/favourites/:imdbID', async (req, res) => {
  const imdbID = req.params.imdbID;
  try {
    const result = await moviesCollection.updateOne({ imdbID }, { $set: { deleted: true } });
    if (result.modifiedCount > 0) {
      res.json({ message: `Movie imdbID: ${imdbID} is now deleted` });
    } else {
      res.status(404).json({ error: 'Movie not found in favourites list' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error deleting movie in the favourite list' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
