import * as React from "react";
import Layout from "../components/layout";
import { graphql } from "gatsby";
import { blogPost } from "./blog-post.module.css";

const BlogPost = ({ data }) => {
  const post = data.markdownRemark;
  return (
    <Layout pageTitle={post.frontmatter.title}>
      <div
        className={blogPost}
        dangerouslySetInnerHTML={{ __html: post.html }}
      />
    </Layout>
  );
};
export const query = graphql`
  query ($slug: String!) {
    markdownRemark(fields: { slug: { eq: $slug } }) {
      html
      frontmatter {
        title
      }
    }
  }
`;

export default BlogPost;
