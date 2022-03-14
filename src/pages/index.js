import React from "react";
import Layout from "../components/Layout";
import BlogPosts from "../components/BlogPosts";
//import { StaticImage } from "gatsby-plugin-image";

const IndexPage = () => {
  return (
    <Layout>
      <main>
        <h1>Projects</h1>
        <section>
          <h2>Project 1</h2>
          <p>Info about Project 1</p>
          <mark>Live Link</mark> - <mark>Github Link</mark>
        </section>
        <section>
          <h2>Project 2</h2>
          <p>Info about Project 2</p>
          <mark>Live Link</mark> - <mark>Github Link</mark>
        </section>
        <section>
          <h2>Project 3</h2>
          <p>Info about Project 3</p>
          <mark>Live Link</mark> - <mark>Github Link</mark>
        </section>
        <h1>Posts</h1>
        <BlogPosts />
      </main>
      {/* 
      <p>Welcome to my web development portfolio.</p>
      <StaticImage
        alt="Paulius Dragunas."
        src="../images/paulius-dragunas.jpg"
      />      
      */}
    </Layout>
  );
};

export default IndexPage;
