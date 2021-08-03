import * as React from "react";
import { Link, graphql } from "gatsby";
import Layout from "../components/layout";
import { blogLink } from "./blog.module.css";

const BlogPage = ({ data }) => {
  return (
    <Layout pageTitle="My Blog Posts">
      <p>{data.allMdx.totalCount} Posts</p>
      {data.allMdx.nodes.map((node) => (
        <div key={node.id}>
          <h2>{node.frontmatter.title}</h2>
          <div>
            {node.frontmatter.date} - {node.timeToRead} min read
          </div>
          <p>{node.excerpt}</p>
        </div>
      ))}
      {/* 
        <p>{data.allMarkdownRemark.totalCount} Posts</p>

      {data.allMarkdownRemark.edges.map(({ node }) => (
        <div key={node.id}>
          <h2>          
            <Link className={blogLink} to={node.fields.slug}>
              {node.frontmatter.title}
            </Link>                      
            {node.frontmatter.title}
          </h2>
          <div>
            {node.frontmatter.date} - {node.timeToRead} min read
          </div>
          <p>{node.excerpt}</p>
        </div>
      ))}
      
      */}
    </Layout>
  );
};

export const query = graphql`
  query {
    allMdx(sort: { fields: frontmatter___date, order: DESC }) {
      nodes {
        id
        frontmatter {
          title
          date(formatString: "DD MMMM, YYYY")
        }
        excerpt
        timeToRead
        body
      }
      totalCount
    }
  }
`;
export default BlogPage;
